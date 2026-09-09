import React, { useState, useEffect, useMemo } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import {
  addDoc, updateDoc, deleteDoc, setDoc, watchDocs,
  serverTimestamp, Timestamp
} from './lib/db';
import { Property, BillingRecord, OperationType, BillingItem, Condominium } from './types';
import { isBalanceItem, isDepositItem } from './utils/billingUtils';
import { parseDate, handleFirestoreError } from './utils/firestore';
import PropertyForm from './components/PropertyForm';
import BillingForm from './components/BillingForm';
import PropertyList from './components/PropertyList';
import { exportPropertiesToExcel } from './components/PropertyExportModal';
import BillingList from './components/BillingList';
import SettingsForm from './components/SettingsForm';
import TenantTransferModal from './components/TenantTransferModal';
import CondoRentReportModal from './components/CondoRentReportModal';
import CondoList from './components/CondoList';
import TenantList from './components/TenantList';
import BackupRestoreModal from './components/BackupRestoreModal';
import WhatsAppSettingsModal from './components/WhatsAppSettingsModal';
import WhatsAppNotificationModal from './components/WhatsAppNotificationModal';
import { 
  LayoutDashboard, 
  Home, 
  DollarSign, 
  Plus, 
  Search,
  LogIn,
  Settings as SettingsIcon,
  History,
  UserMinus,
  Trash2,
  Archive,
  ArrowRightLeft,
  AlertCircle,
  FileSpreadsheet,
  Building2,
  Users,
  Database,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, addMonths, startOfMonth, setDate, isBefore, startOfDay, addDays } from 'date-fns';

function asDate(val: any): Date {
  return parseDate(val) || new Date(0);
}

type Tab = 'properties' | 'billings' | 'tenants';

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('properties');
  const [propertiesSubTab, setPropertiesSubTab] = useState<'properties' | 'condominiums'>('properties');
  const [billingsSubTab, setBillingsSubTab] = useState<'active' | 'debtors'>('active');
  const [properties, setProperties] = useState<Property[]>([]);
  const [condominiums, setCondominiums] = useState<Condominium[]>([]);
  const [billings, setBillings] = useState<BillingRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPropertyForHistory, setSelectedPropertyForHistory] = useState<string | null>(null);
  const [propertiesLimit, setPropertiesLimit] = useState(1000);
  const [billingsLimit, setBillingsLimit] = useState(500);
  const [hasMoreProperties, setHasMoreProperties] = useState(true);
  const [hasMoreBillings, setHasMoreBillings] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [isPropertyModalOpen, setIsPropertyModalOpen] = useState(false);
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isCondoReportModalOpen, setIsCondoReportModalOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [isWhatsAppSettingsModalOpen, setIsWhatsAppSettingsModalOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [editingBilling, setEditingBilling] = useState<BillingRecord | null>(null);
  const [propertyToEndContract, setPropertyToEndContract] = useState<Property | null>(null);
  const [isEndContractModalOpen, setIsEndContractModalOpen] = useState(false);
  const [defaultPropertyIdForBilling, setDefaultPropertyIdForBilling] = useState<string | null>(null);

  const [isBillingDeleteModalOpen, setIsBillingDeleteModalOpen] = useState(false);
  const [billingIdsToDelete, setBillingIdsToDelete] = useState<string[]>([]);
  const [billingToDeleteInfo, setBillingToDeleteInfo] = useState<{ propertyCode: string, tenantName: string, date: string } | null>(null);

  const [isPropertyDeleteModalOpen, setIsPropertyDeleteModalOpen] = useState(false);
  const [propertyToDelete, setPropertyToDelete] = useState<Property | null>(null);

  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const unsubProperties = watchDocs(
      'properties',
      { orderByField: 'propertyCode', ascending: true, limit: propertiesLimit },
      (docs) => {
        setProperties(docs as Property[]);
        setHasMoreProperties(docs.length === propertiesLimit);
        setError(null);
      },
      (err) => {
        setError(`Erro ao carregar imóveis: ${err.message}`);
        handleFirestoreError(err, OperationType.LIST, 'properties');
      }
    );

    // Main list: fetch recent billings globally
    // We don't filter by archived in the query to avoid index complexity and
    // missing old records that don't have the 'archived' field.
    // Filtering is done in memory via filteredBillings.
    const unsubBillings = watchDocs(
      'billings',
      {
        orderByField: 'dueDate',
        ascending: false,
        limit: billingsLimit,
        filters: selectedPropertyForHistory
          ? [{ field: 'propertyId', op: 'eq', value: selectedPropertyForHistory }]
          : undefined,
      },
      (docs) => {
        setBillings(docs as BillingRecord[]);
        setHasMoreBillings(docs.length === billingsLimit);
        setError(null);
      },
      (err) => {
        setError(`Erro ao carregar cobranças: ${err.message}`);
        handleFirestoreError(err, OperationType.LIST, 'billings');
      }
    );

    const unsubCondos = watchDocs(
      'condominiums',
      { orderByField: 'name', ascending: true },
      (docs) => {
        setCondominiums(docs as Condominium[]);
      },
      (err) => {
        console.error('Erro ao carregar condomínios:', err);
      }
    );

    return () => {
      unsubProperties();
      unsubBillings();
      unsubCondos();
    };
  }, [user, propertiesLimit, billingsLimit, selectedPropertyForHistory, activeTab]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthInfo(null);
    setAuthLoading(true);
    try {
      const email = authEmail.trim();
      const password = authPassword;
      if (!email || !password) {
        setAuthError('Informe e-mail e senha.');
        return;
      }
      if (password.length < 6) {
        setAuthError('A senha precisa ter pelo menos 6 caracteres.');
        return;
      }

      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setAuthInfo('Conta criada. Se pedir confirmação de e-mail, confira a caixa de entrada e depois faça login.');
          setAuthMode('login');
        }
      }
    } catch (error: any) {
      console.error('Auth failed:', error);
      setAuthError(error?.message || 'Falha na autenticação.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => supabase.auth.signOut();

  const handleDeleteProperty = (id: string) => {
    const property = properties.find(p => p.id === id);
    if (property) {
      setPropertyToDelete(property);
      setIsPropertyDeleteModalOpen(true);
    }
  };

  const handleUpdateProperty = async (id: string, data: Partial<Property>) => {
    try {
      await updateDoc('properties', id, {
        ...data,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'properties');
    }
  };

  const confirmDeleteProperty = async () => {
    if (!propertyToDelete) return;
    try {
      await deleteDoc('properties', propertyToDelete.id);
      setIsPropertyDeleteModalOpen(false);
      setPropertyToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'properties');
    }
  };

  const handleEndContract = async (property: Property) => {
    try {
      const path = 'properties';
      const updates: any = { status: 'inactive' };
      if (property.securityDepositPaid || (property.securityDepositAmount && property.securityDepositAmount > 0)) {
        updates.securityDepositAmount = 0;
        updates.securityDepositPaid = false;
      }
      await setDoc(path as any, property.id, updates, { merge: true });
      setIsEndContractModalOpen(false);
      setPropertyToEndContract(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'properties');
    }
  };

  const handleNewContract = (property: Property) => {
    const newContractData: Property = {
      ...property,
      ownerName: '',
      phone: '',
      phones: [],
      tenantCpf: '',
      tenantEmail: '',
      rentAmount: 0,
      initialWaterReading: property.initialWaterReading || 0,
      initialElectricityReading: property.initialElectricityReading || 0,
      leaseStartDate: Timestamp.now(),
      leaseDurationDays: 90,
      leaseEndDate: null,
      contractType: 'temporada',
      adminFee: undefined,
      cleaningFee: undefined,
      maxOccupants: undefined,
      status: 'active',
    };
    setEditingProperty(newContractData);
    setIsPropertyModalOpen(true);
  };

  const handleDeleteBilling = async (idOrIds: string | string[]) => {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    const firstId = ids[0];
    const billing = billings.find(b => b.id === firstId);
    if (billing) {
      const property = properties.find(p => p.id === billing.propertyId);
      setBillingToDeleteInfo({
        propertyCode: property?.propertyCode || billing.propertyCode || 'N/A',
        tenantName: billing.tenantName || property?.ownerName || 'N/A',
        date: format(asDate(billing.dueDate), 'dd/MM/yyyy')
      });
      setBillingIdsToDelete(ids);
      setIsBillingDeleteModalOpen(true);
    }
  };

  const confirmDeleteBilling = async () => {
    try {
      await Promise.all(billingIdsToDelete.map(id => deleteDoc('billings', id)));

      setIsBillingDeleteModalOpen(false);
      setBillingIdsToDelete([]);
      setBillingToDeleteInfo(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'billings');
    }
  };

  const handleArchiveBilling = async (ids: string[]) => {
    try {
      await Promise.all(ids.map(async (id) => {
        const billing = allBillings.find(b => b.id === id);
        if (billing) {
          const isVirtual = id.toString().startsWith('virtual_');
          if (isVirtual) {
            const { id: _, isVirtual: __, ...billingData } = billing as any;
            await addDoc('billings', {
              ...billingData,
              archived: !billing.archived,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          } else {
            await updateDoc('billings', id, { 
              archived: !billing.archived,
              updatedAt: serverTimestamp()
            });
          }
        }
      }));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'billings');
    }
  };

  const handleUpdateBillingColor = async (ids: string[], color: string) => {
    try {
      await Promise.all(ids.map(async (id) => {
        const billing = allBillings.find(b => b.id === id);
        if (billing) {
          const isVirtual = id.toString().startsWith('virtual_');
          if (isVirtual) {
            const { id: _, isVirtual: __, ...billingData } = billing as any;
            await addDoc('billings', {
              ...billingData,
              colorTag: color,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          } else {
            await updateDoc('billings', id, { 
              colorTag: color,
              updatedAt: serverTimestamp()
            });
          }
        }
      }));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'billings');
    }
  };

  const handleUpdateBillingNotes = async (ids: string[], notes: string) => {
    try {
      await Promise.all(ids.map(async (id) => {
        const billing = allBillings.find(b => b.id === id);
        if (billing) {
          const isVirtual = id.toString().startsWith('virtual_');
          if (isVirtual) {
            const { id: _, isVirtual: __, ...billingData } = billing as any;
            await addDoc('billings', {
              ...billingData,
              notes,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          } else {
            await updateDoc('billings', id, { 
              notes,
              updatedAt: serverTimestamp()
            });
          }
        }
      }));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'billings');
    }
  };

  const handleUpdateBillingStatus = async (ids: string[], status: 'pending' | 'paid' | 'overdue' | 'cancelled') => {
    try {
      const affectedPropertyIds = new Set<string>();

      await Promise.all(ids.map(async (id) => {
        // Use allBillings to find the record (includes virtual ones)
        const billing = allBillings.find(b => b.id === id);
        if (!billing) return;

        if (billing.propertyId) affectedPropertyIds.add(billing.propertyId);

        const isVirtual = id.toString().startsWith('virtual_');

        if (isVirtual) {
          // For virtual billings, we create a new document in Firestore
          // We remove fields that shouldn't be saved directly
          const { id: _, isVirtual: __, ...billingData } = billing as any;
          
          const newDocData = {
            ...billingData,
            status,
            paidAmount: status === 'paid' ? billing.totalAmount || 0 : 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          await addDoc('billings', newDocData);
        } else {
          // For real billings, we update the existing document
          const updateData: any = { 
            status,
            updatedAt: serverTimestamp()
          };

          // If marked as paid, ensure paidAmount matches totalAmount
          if (status === 'paid') {
            updateData.paidAmount = billing.totalAmount || 0;
          }

          await updateDoc('billings', id, updateData);

          // If marked as paid, generate next month's billing
          if (status === 'paid') {
            const nextDueDate = addMonths(asDate(billing.dueDate), 1);
            
            // Check if a billing already exists for this property and due date
            const existingNext = billings.find(b => 
              b.propertyId === billing.propertyId && 
              format(asDate(b.dueDate), 'yyyy-MM') === format(nextDueDate, 'yyyy-MM')
            );

            if (!existingNext) {
              const nextItems: BillingItem[] = (billing.items || []).map(item => {
                const newItem: BillingItem = {
                  type: item.type,
                  amount: 0, // Reset amount for next month
                  notes: item.notes || '',
                };

                // Carry over readings
                if (item.currentReading !== undefined && item.currentReading !== null) {
                  newItem.previousReading = item.currentReading;
                  newItem.currentReading = null;
                } else {
                  newItem.previousReading = item.previousReading || 0;
                  newItem.currentReading = null;
                }

                return newItem;
              });

              // Pre-populate rent amount
              const property = properties.find(p => p.id === billing.propertyId);
              nextItems.forEach(item => {
                if (item.type === 'rent' && property?.rentAmount) {
                  item.amount = property.rentAmount;
                }
              });

              await addDoc('billings', {
                propertyId: billing.propertyId,
                propertyCode: billing.propertyCode || '',
                tenantName: billing.tenantName || '',
                tenantPhone: billing.tenantPhone || '',
                items: nextItems,
                totalAmount: nextItems.reduce((sum, i) => sum + i.amount, 0),
                status: 'pending',
                dueDate: Timestamp.fromDate(nextDueDate),
                readingDate: Timestamp.fromDate(new Date()),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }
          }
        }
      }));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'billings');
    }
  };

  const filteredProperties = properties.filter(p => 
    p.propertyCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.ownerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

    const allBillings = React.useMemo(() => {
    let combined = [...billings];
    const today = startOfDay(new Date());
    const horizonDate = addDays(today, 32);
    const startOfCurrentMonth = startOfMonth(today);

    // Filter active properties once
    const activeProperties = properties.filter(p => p.status === 'active');

    activeProperties.forEach(property => {
      let iterations = 0;
      const MAX_ITERATIONS = 12; // Allow up to a year of catch-up

      while (iterations < MAX_ITERATIONS) {
        iterations++;
        
        // Find the latest billing for this property in the current combined list
        // This includes actual billings and any virtual ones added in previous iterations
        const leaseStart = parseDate(property.leaseStartDate);
        const currentTenantName = property.ownerName || '';
        const propertyBillingsForProperty = combined.filter(b => {
          if (b.propertyId !== property.id) return false;

          // Only consider billings for the CURRENT active tenant
          if (currentTenantName && b.tenantName && b.tenantName.trim().toLowerCase() !== currentTenantName.trim().toLowerCase()) {
            return false;
          }

          // If we have a lease start date, only consider billings from this contract period
          if (leaseStart && b.dueDate) {
            return !isBefore(asDate(b.dueDate), leaseStart);
          }
          return true;
        });
        
        const latest = [...propertyBillingsForProperty].sort((a, b) => (asDate(b.dueDate).getTime()) - (asDate(a.dueDate).getTime()))[0];
        
        let nextDueDate: Date;
        let previousReadings: Record<string, number> = {};

        const getLatestReadingForType = (itemType: 'water' | 'electricity') => {
          for (const b of propertyBillingsForProperty) {
            const found = b.items?.find(i => i.type === itemType);
            if (found) {
              if (typeof found.currentReading === 'number' && !isNaN(found.currentReading) && found.currentReading > 0) {
                return found.currentReading;
              }
              if (typeof found.previousReading === 'number' && !isNaN(found.previousReading) && found.previousReading > 0) {
                return found.previousReading;
              }
            }
          }
          return itemType === 'water' 
            ? (property.initialWaterReading || 0) 
            : (property.initialElectricityReading || 0);
        };

        if (latest && latest.dueDate) {
          nextDueDate = addMonths(asDate(latest.dueDate), 1);
          previousReadings['water'] = getLatestReadingForType('water');
          previousReadings['electricity'] = getLatestReadingForType('electricity');
        } else {
          // No billings yet, use lease start date or current month
          const leaseStart = parseDate(property.leaseStartDate) || new Date();
          nextDueDate = setDate(leaseStart, property.leaseStartDate ? leaseStart.getDate() : 10);
          
          // Ensure first billing is at least 30 days after lease start (standard month cycle)
          // to avoid charging immediately on the start date
          if (isBefore(nextDueDate, addDays(leaseStart, 30))) {
            nextDueDate = addMonths(nextDueDate, 1);
          }
          
          while (isBefore(nextDueDate, startOfCurrentMonth)) {
            nextDueDate = addMonths(nextDueDate, 1);
          }
          
          previousReadings['water'] = property.initialWaterReading || 0;
          previousReadings['electricity'] = property.initialElectricityReading || 0;
        }

        const monthKey = format(nextDueDate, 'yyyy-MM');
        const isNextWithinHorizon = isBefore(nextDueDate, horizonDate) || format(nextDueDate, 'yyyy-MM-dd') === format(horizonDate, 'yyyy-MM-dd');
        const isHistorical = isBefore(nextDueDate, today);
        
        // Show virtual billings if:
        // 1. It's historical (catch-up)
        // 2. OR it's within horizon (current/near future)
        if (isHistorical || isNextWithinHorizon) {
          const virtualId = `virtual_${property.id}_${format(nextDueDate, 'yyyyMM')}`;
          
          // Final check to avoid duplicates for the same month
          if (!combined.some(b => b.propertyId === property.id && format(asDate(b.dueDate), 'yyyy-MM') === monthKey)) {
            const unpaidBal = latest ? Math.round(((latest.totalAmount || 0) - (latest.paidAmount || 0) + Number.EPSILON) * 100) / 100 : 0;

            const items: BillingItem[] = [
              { type: 'rent', amount: property.rentAmount || 0 },
              { type: 'water', amount: 0, previousReading: previousReadings['water'] || 0 },
              { type: 'electricity', amount: 0, previousReading: previousReadings['electricity'] || 0 }
            ];

            if (unpaidBal > 0.01) {
              items.push({
                type: 'other',
                amount: unpaidBal,
                notes: 'Saldo Devedor Anterior Acumulado'
              });
            } else if (unpaidBal < -0.01) {
              items.push({
                type: 'other',
                amount: unpaidBal,
                notes: 'Saldo Positivo Anterior (Crédito)'
              });
            }

            combined.push({
              id: virtualId,
              propertyId: property.id,
              propertyCode: property.propertyCode || '',
              tenantName: property.ownerName || '',
              tenantPhone: property.phone || '',
              items,
              totalAmount: items.reduce((sum, i) => sum + i.amount, 0),
              status: isHistorical ? 'overdue' : 'pending',
              dueDate: Timestamp.fromDate(nextDueDate),
              readingDate: Timestamp.fromDate(new Date()),
              createdAt: Timestamp.now(),
              isVirtual: true
            } as any);
          } else {
            // Month exists, continue to check next one if iterations < limit
            continue;
          }
        } else {
          break;
        }
      }
    });

    return combined;
  }, [billings, properties]);

  const filteredBillings = allBillings.filter(b => {
    const property = properties.find(p => p.id === b.propertyId);
    const propertyCode = property?.propertyCode || b.propertyCode || '';
    const billingTenantName = b.tenantName || '';
    const currentTenantName = property?.ownerName || '';
    const propertyStatus = property?.status || 'active';
    
    const matchesSearch = searchTerm === '' || 
      propertyCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      billingTenantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      currentTenantName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesProperty = !selectedPropertyForHistory || b.propertyId === selectedPropertyForHistory;
    const isArchived = b.archived === true;
    const shouldShow = !isArchived || !!selectedPropertyForHistory || showArchived;

    // Sub-tab specific filtering inside Cobranças
    const hasActiveContract = propertyStatus === 'active' && 
      currentTenantName.trim() !== '' && 
      billingTenantName.trim().toLowerCase() === currentTenantName.trim().toLowerCase();

    if (billingsSubTab === 'active') {
      // Apenas inquilinos ativos aparecem na sub-aba cobrancas ativas.
      if (!hasActiveContract && (!selectedPropertyForHistory || b.propertyId !== selectedPropertyForHistory)) {
        return false;
      }

      // Respect the user's manual archiving. 
      if (isArchived && !showArchived && !selectedPropertyForHistory) return false;
    } else if (billingsSubTab === 'debtors') {
      // Somente faturas de inquilinos com contrato rescindido (imovel inativo ou inquilino antigo) e debito aberto aparecem no "Saiu Devendo"
      const isRescindedContract = !hasActiveContract;
      const hasOpenDebt = b.status !== 'paid';
      if (!isRescindedContract || !hasOpenDebt) return false;
    }
    
    return matchesSearch && matchesProperty && shouldShow;
  });

  // Calculate counters for Cobranças sub-tabs
  const activeBillingsCount = useMemo(() => {
    return allBillings.filter(b => {
      const prop = properties.find(p => p.id === b.propertyId);
      const currentTenantName = prop?.ownerName || '';
      const billingTenantName = b.tenantName || '';
      const propertyStatus = prop?.status || 'active';
      const hasActiveContract = propertyStatus === 'active' && 
        currentTenantName.trim() !== '' && 
        billingTenantName.trim().toLowerCase() === currentTenantName.trim().toLowerCase();
      const isArchived = b.archived === true;
      return (hasActiveContract || (selectedPropertyForHistory && b.propertyId === selectedPropertyForHistory)) && (!isArchived || showArchived);
    }).length;
  }, [allBillings, properties, selectedPropertyForHistory, showArchived]);

  const debtorsCount = useMemo(() => {
    return allBillings.filter(b => {
      const prop = properties.find(p => p.id === b.propertyId);
      const currentTenantName = prop?.ownerName || '';
      const billingTenantName = b.tenantName || '';
      const propertyStatus = prop?.status || 'active';
      const hasActiveContract = propertyStatus === 'active' && 
        currentTenantName.trim() !== '' && 
        billingTenantName.trim().toLowerCase() === currentTenantName.trim().toLowerCase();
      return !hasActiveContract && b.status !== 'paid';
    }).length;
  }, [allBillings, properties]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50/70 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-white p-10 rounded-[32px] shadow-[0_10px_40px_rgba(0,0,0,0.03)] max-w-md w-full text-center border border-slate-100"
        >
          <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-md shadow-blue-100">
            <LayoutDashboard className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">Gestão Billing</h1>
          <p className="text-slate-400 text-sm mb-6 font-medium leading-relaxed">Entre com e-mail e senha para gerenciar cobranças, imóveis e WhatsApp.</p>

          <form onSubmit={handleAuthSubmit} className="text-left space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">E-mail</label>
              <input
                type="email"
                autoComplete="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none text-sm font-semibold"
                placeholder="seu@email.com"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">Senha</label>
              <input
                type="password"
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none text-sm font-semibold"
                placeholder="Mínimo 6 caracteres"
                required
                minLength={6}
              />
            </div>

            {authError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 font-medium">
                {authError}
              </div>
            )}
            {authInfo && (
              <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 font-medium">
                {authInfo}
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-3 shadow-md hover:shadow-lg active:scale-95 duration-200 cursor-pointer disabled:opacity-60"
            >
              <LogIn size={20} />
              {authLoading
                ? 'Aguarde...'
                : authMode === 'login'
                  ? 'Entrar'
                  : 'Criar conta'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setAuthMode(authMode === 'login' ? 'signup' : 'login');
              setAuthError(null);
              setAuthInfo(null);
            }}
            className="mt-5 text-sm font-bold text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
          >
            {authMode === 'login'
              ? 'Não tem conta? Criar conta'
              : 'Já tem conta? Entrar'}
          </button>
        </motion.div>
      </div>
    );
  }

  // Sistema interno: qualquer usuário autenticado tem acesso completo
  const isAdmin = !!user;

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans text-slate-900 antialiased selection:bg-blue-500/10 selection:text-blue-600">
      {/* Main Content */}
      <main className="flex flex-col min-h-screen">
        {/* Header */}
        <header className="bg-white/90 backdrop-blur-md border-b border-slate-200/50 px-8 py-4 flex items-center justify-between sticky top-0 z-30 shadow-[0_2px_15px_rgba(0,0,0,0.01)]">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2.5">
              <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 p-2 rounded-xl text-white shadow-sm ring-4 ring-blue-50">
                <LayoutDashboard size={20} />
              </div>
              <span className="font-extrabold text-lg text-slate-900 tracking-tight hidden lg:block">Gestão Billing</span>
            </div>

            <nav className="flex items-center bg-slate-100/70 p-1 rounded-2xl border border-slate-200/20">
              {[
                { id: 'properties', label: 'Imóveis', icon: Home },
                { id: 'billings', label: 'Cobranças', icon: DollarSign },
                { id: 'tenants', label: 'Inquilinos', icon: Users },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as Tab)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs md:text-sm transition-all duration-200 cursor-pointer relative ${
                    activeTab === tab.id 
                      ? 'bg-white text-slate-900 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-slate-200/20' 
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50/50'
                  }`}
                >
                  <tab.icon size={16} className={activeTab === tab.id ? 'text-blue-600' : 'text-slate-400'} />
                  <span className="hidden sm:block">{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3 lg:gap-6">
            <div className="relative hidden sm:block group">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={15} />
              <input
                type="text"
                placeholder="Busca por imóvel ou inquilino..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/5 focus:bg-white focus:border-blue-500 outline-none w-32 md:w-60 lg:w-80 transition-all font-semibold text-xs md:text-sm placeholder:text-slate-400"
              />
            </div>
            
            {isAdmin && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsWhatsAppModalOpen(true)}
                  className="p-2 lg:px-3 lg:py-2 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-xl font-bold transition-all flex items-center gap-1.5 shadow-sm border border-emerald-200 cursor-pointer text-xs"
                  title="Central de Cobrança WhatsApp (UAZAPI)"
                >
                  <MessageSquare size={16} className="text-emerald-600" />
                  <span className="hidden lg:inline">WhatsApp</span>
                </button>
                <button
                  onClick={() => setIsBackupModalOpen(true)}
                  className="p-2 lg:px-3 lg:py-2 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl font-bold transition-all flex items-center gap-1.5 shadow-sm border border-indigo-100 cursor-pointer text-xs"
                  title="Fazer Backup / Importar Dados no Remix"
                >
                  <Database size={16} />
                  <span className="hidden lg:inline">Backup / Remix</span>
                </button>
                <button
                  onClick={() => setIsSettingsModalOpen(true)}
                  className="p-2 lg:px-3 lg:py-2 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold transition-all flex items-center gap-1.5 shadow-sm border border-slate-200/60 cursor-pointer text-xs"
                  title="Configurações de Tarifas"
                >
                  <SettingsIcon size={16} />
                  <span className="hidden lg:inline">Tarifas</span>
                </button>
                {activeTab === 'properties' && (
                  <button
                    onClick={() => setIsTransferModalOpen(true)}
                    className="p-2 lg:px-3 lg:py-2 text-amber-600 bg-amber-50 hover:bg-amber-100/80 rounded-xl font-bold transition-all flex items-center gap-1.5 shadow-sm border border-amber-100/50 cursor-pointer text-xs"
                    title="Troca Rápida de Inquilinos"
                  >
                    <ArrowRightLeft size={16} />
                    <span className="hidden lg:inline">Troca Rápida</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    if (activeTab === 'properties') {
                      setEditingProperty(null);
                      setIsPropertyModalOpen(true);
                    } else {
                      setEditingBilling(null);
                      setDefaultPropertyIdForBilling(null);
                      setIsBillingModalOpen(true);
                    }
                  }}
                  className="bg-blue-600 text-white p-2 lg:px-4 lg:py-2 rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center gap-2 shadow-sm hover:shadow-md hover:shadow-blue-200 tracking-tight cursor-pointer text-xs"
                >
                  <Plus size={16} />
                  <span className="hidden lg:inline">
                    {activeTab === 'properties' ? 'Novo Imóvel' : 'Nova Cobrança'}
                  </span>
                </button>
              </div>
            )}

            <div className="h-6 w-px bg-slate-200 hidden sm:block" />

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end">
                <p className="text-xs font-black text-slate-800 truncate tracking-tight max-w-[120px]">{user.displayName}</p>
                <button onClick={handleLogout} className="text-[9px] font-bold text-slate-400 hover:text-rose-500 cursor-pointer uppercase tracking-wider transition-colors">Sair</button>
              </div>
              <img src={user.photoURL || ''} referrerPolicy="no-referrer" alt="" className="w-8 h-8 rounded-xl border border-slate-200/50 shadow-sm" />
            </div>
          </div>
        </header>

        {error && (
          <div className="mx-8 mt-4 p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl flex items-center gap-3 font-bold text-sm shadow-sm animate-in fade-in slide-in-from-top-2">
            <AlertCircle size={20} />
            {error}
            <button onClick={() => window.location.reload()} className="underline ml-auto flex items-center gap-1 hover:text-rose-700">
              Recarregar
            </button>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 p-8">
          <div className="max-w-[1600px] xl:max-w-[1850px] mx-auto w-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                {activeTab === 'properties' && (
                  <div className="space-y-6">
                    {/* Sub-Tabs Bar inside Imóveis */}
                    <div className="bg-white rounded-3xl border border-slate-200/60 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-2 p-1 bg-slate-100/80 rounded-2xl border border-slate-200/30 self-start sm:self-auto">
                        <button
                          onClick={() => setPropertiesSubTab('properties')}
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs md:text-sm transition-all cursor-pointer ${
                            propertiesSubTab === 'properties'
                              ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50'
                              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                          }`}
                        >
                          <Home size={16} className={propertiesSubTab === 'properties' ? 'text-blue-600' : 'text-slate-400'} />
                          <span>Todos os Imóveis</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-700">
                            {properties.length}
                          </span>
                        </button>

                        <button
                          onClick={() => setPropertiesSubTab('condominiums')}
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs md:text-sm transition-all cursor-pointer ${
                            propertiesSubTab === 'condominiums'
                              ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50'
                              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                          }`}
                        >
                          <Building2 size={16} className={propertiesSubTab === 'condominiums' ? 'text-indigo-600' : 'text-slate-400'} />
                          <span>Cadastros dos Condomínios</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-700">
                            {condominiums.length}
                          </span>
                        </button>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        {propertiesSubTab === 'properties' && (
                          <button
                            onClick={() => exportPropertiesToExcel(properties, undefined, 'Exportação Geral de Todos os Imóveis')}
                            className="flex items-center gap-2 px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl font-black transition-all text-xs cursor-pointer shadow-2xs active:scale-95"
                            title="Baixar planilha de todos os imóveis no formato Excel (.xlsx)"
                          >
                            <FileSpreadsheet size={15} className="text-emerald-600" />
                            <span>Baixar Planilha Excel</span>
                          </button>
                        )}

                        {isAdmin && propertiesSubTab === 'properties' && (
                          <button
                            onClick={() => {
                              setEditingProperty(null);
                              setIsPropertyModalOpen(true);
                            }}
                            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm hover:shadow-blue-200 transition-all text-xs cursor-pointer active:scale-95"
                          >
                            <Plus size={16} />
                            <span className="uppercase tracking-widest text-[11px]">Novo Imóvel</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {propertiesSubTab === 'properties' ? (
                      <div className="space-y-8">
                        <PropertyList 
                          properties={filteredProperties} 
                          onEdit={(p) => { setEditingProperty(p); setIsPropertyModalOpen(true); }}
                          onDelete={handleDeleteProperty}
                          onUpdate={handleUpdateProperty}
                          onViewHistory={(p) => {
                            setSelectedPropertyForHistory(p.id);
                            setActiveTab('billings');
                          }}
                          onEndContract={(p) => {
                            setPropertyToEndContract(p);
                            setIsEndContractModalOpen(true);
                          }}
                          onNewBilling={(p) => {
                            setEditingBilling(null);
                            setDefaultPropertyIdForBilling(p.id);
                            setIsBillingModalOpen(true);
                          }}
                          onNewContract={handleNewContract}
                        />
                        {hasMoreProperties && (
                          <div className="flex justify-center">
                            <button 
                              onClick={() => setPropertiesLimit(prev => prev + 24)}
                              className="px-8 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl hover:bg-slate-50 transition-all font-bold shadow-sm"
                            >
                              Carregar mais imóveis
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <CondoList
                        condominiums={condominiums}
                        properties={properties}
                        billings={billings}
                        isAdmin={isAdmin}
                      />
                    )}
                  </div>
                )}
                {activeTab === 'billings' && (
                  <div className="space-y-6">
                    {/* Sub-Tabs Bar inside Cobranças */}
                    <div className="bg-white rounded-3xl border border-slate-200/60 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-2 p-1 bg-slate-100/80 rounded-2xl border border-slate-200/30 self-start sm:self-auto">
                        <button
                          onClick={() => setBillingsSubTab('active')}
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs md:text-sm transition-all cursor-pointer ${
                            billingsSubTab === 'active'
                              ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50'
                              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                          }`}
                        >
                          <DollarSign size={16} className={billingsSubTab === 'active' ? 'text-blue-600' : 'text-slate-400'} />
                          <span>Cobranças Ativas</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                            billingsSubTab === 'active' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'
                          }`}>
                            {activeBillingsCount}
                          </span>
                        </button>

                        <button
                          onClick={() => setBillingsSubTab('debtors')}
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs md:text-sm transition-all cursor-pointer ${
                            billingsSubTab === 'debtors'
                              ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50'
                              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                          }`}
                        >
                          <UserMinus size={16} className={billingsSubTab === 'debtors' ? 'text-rose-600' : 'text-slate-400'} />
                          <span>Saiu Devendo</span>
                          {debtorsCount > 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-700">
                              {debtorsCount}
                            </span>
                          ) : (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              billingsSubTab === 'debtors' ? 'bg-slate-100 text-slate-700' : 'bg-slate-200 text-slate-600'
                            }`}>
                              0
                            </span>
                          )}
                        </button>
                      </div>

                      {isAdmin && (
                        <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
                          <button
                            onClick={() => setIsCondoReportModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-sm hover:shadow-indigo-200 transition-all text-xs cursor-pointer"
                          >
                            <Building2 size={16} />
                            <span className="uppercase tracking-widest text-[11px]">Relatório por Condomínio</span>
                          </button>

                          {billingsSubTab === 'active' && (
                            <button
                              onClick={() => setShowArchived(!showArchived)}
                              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all font-bold shadow-sm text-xs ${
                                showArchived 
                                  ? 'bg-purple-50 border-purple-200 text-purple-700' 
                                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              <Archive size={16} />
                              <span className="hidden sm:inline uppercase tracking-widest text-[11px]">
                                {showArchived ? 'Ocultar Arquivados' : 'Ver Arquivados'}
                              </span>
                            </button>
                          )}
                          <button
                            onClick={() => setIsSettingsModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2.5 text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all font-bold shadow-sm text-xs"
                          >
                            <SettingsIcon size={16} />
                            <span className="hidden sm:inline uppercase tracking-widest text-[11px]">Tarifas</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Section Header */}
                    <div className="flex items-center gap-4 bg-white p-5 rounded-3xl border border-slate-200/60 shadow-sm">
                      <div className={`${billingsSubTab === 'debtors' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'} p-3 rounded-2xl`}>
                        {billingsSubTab === 'debtors' ? <UserMinus size={24} /> : <DollarSign size={24} />}
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-slate-900 tracking-tight">
                          {billingsSubTab === 'debtors' ? 'Saiu Devendo (Sub-Lista de Pendências)' : 'Fluxo de Cobranças (Inquilinos Ativos)'}
                        </h3>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                          {billingsSubTab === 'debtors' ? 'Inquilinos inativos com débitos pendentes em aberto' : 'Controle financeiro e de leituras mensais'}
                        </p>
                      </div>
                    </div>

                    {selectedPropertyForHistory && (
                      <div className="flex items-center justify-between bg-blue-50/50 p-6 rounded-3xl border border-blue-100 shadow-sm">
                        <div className="flex items-center gap-4 text-blue-700">
                          <div className="bg-blue-100 p-2 rounded-xl">
                            <History size={22} />
                          </div>
                          <div>
                            <p className="text-sm font-bold">Filtrando por imóvel</p>
                            <p className="text-lg font-black tracking-tight">
                              {properties.find(p => p.id === selectedPropertyForHistory)?.propertyCode}
                            </p>
                          </div>
                        </div>
                        <button 
                          onClick={() => setSelectedPropertyForHistory(null)}
                          className="px-4 py-2 bg-blue-100 text-blue-700 rounded-xl font-bold hover:bg-blue-200 transition-all text-sm"
                        >
                          Limpar Filtro
                        </button>
                      </div>
                    )}
                    <BillingList 
                      billings={filteredBillings} 
                      properties={properties}
                      onEdit={(b) => { setEditingBilling(b); setIsBillingModalOpen(true); }}
                      onDelete={handleDeleteBilling}
                      onArchive={handleArchiveBilling}
                      onUpdateColor={handleUpdateBillingColor}
                      onUpdateStatus={handleUpdateBillingStatus}
                      onUpdateNotes={handleUpdateBillingNotes}
                    />
                    {hasMoreBillings && (
                      <div className="flex justify-center">
                        <button 
                          onClick={() => setBillingsLimit(prev => prev + 100)}
                          className="px-8 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl hover:bg-slate-50 transition-all font-bold shadow-sm"
                        >
                          Carregar mais cobranças
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {activeTab === 'tenants' && (
                  <TenantList
                    properties={properties}
                    billings={billings}
                    onViewPropertyHistory={(propertyId) => {
                      setSelectedPropertyForHistory(propertyId);
                      setActiveTab('billings');
                    }}
                    onEditProperty={(property) => {
                      setEditingProperty(property);
                      setIsPropertyModalOpen(true);
                    }}
                    onUpdateProperty={handleUpdateProperty}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Modals */}
      {isPropertyModalOpen && (
        <PropertyForm 
          property={editingProperty} 
          properties={properties}
          onClose={() => setIsPropertyModalOpen(false)} 
        />
      )}
      {isBillingModalOpen && (
        <BillingForm 
          billing={editingBilling} 
          properties={properties}
          defaultPropertyId={defaultPropertyIdForBilling || undefined}
          onClose={() => {
            setIsBillingModalOpen(false);
            setDefaultPropertyIdForBilling(null);
          }} 
        />
      )}
      {isSettingsModalOpen && (
        <SettingsForm 
          onClose={() => setIsSettingsModalOpen(false)} 
        />
      )}
      {isTransferModalOpen && (
        <TenantTransferModal 
          properties={properties}
          billings={billings}
          onClose={() => setIsTransferModalOpen(false)}
        />
      )}

      {/* Property Delete Confirmation Modal */}
      <AnimatePresence>
        {isPropertyDeleteModalOpen && propertyToDelete && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[40px] p-10 max-w-md w-full shadow-2xl border border-slate-100"
            >
              <div className="bg-rose-50 w-20 h-20 rounded-3xl flex items-center justify-center mb-8 text-rose-600 shadow-inner shadow-rose-100">
                <Trash2 size={40} />
              </div>
              <h3 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Excluir Imóvel?</h3>
              <p className="text-slate-500 mb-10 font-medium leading-relaxed">
                Deseja realmente excluir o imóvel <span className="font-black text-slate-900">{propertyToDelete.propertyCode}</span>? 
                <br /><br />
                <span className="text-sm text-rose-500 font-bold bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-100">Atenção: As cobranças vinculadas permanecerão no sistema.</span>
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setIsPropertyDeleteModalOpen(false);
                    setPropertyToDelete(null);
                  }}
                  className="flex-1 px-6 py-4 bg-slate-100 text-slate-600 rounded-3xl font-bold hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDeleteProperty}
                  className="flex-1 px-6 py-4 bg-rose-600 text-white rounded-3xl font-bold hover:bg-rose-700 transition-all shadow-xl shadow-rose-200"
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Billing Delete Confirmation Modal */}
      <AnimatePresence>
        {isBillingDeleteModalOpen && billingToDeleteInfo && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[40px] p-10 max-w-md w-full shadow-2xl border border-slate-100"
            >
              <div className="bg-rose-50 w-20 h-20 rounded-3xl flex items-center justify-center mb-8 text-rose-600 shadow-inner shadow-rose-100">
                <Trash2 size={40} />
              </div>
              <h3 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Excluir Cobrança?</h3>
              <p className="text-slate-500 mb-10 font-medium leading-relaxed">
                Deseja realmente excluir a cobrança de <span className="font-black text-slate-900">{billingToDeleteInfo.tenantName}</span> ({billingToDeleteInfo.propertyCode}) com vencimento em <span className="font-black text-slate-900">{billingToDeleteInfo.date}</span>?
                {billingIdsToDelete.length > 1 && (
                  <>
                    <br /><br />
                    <span className="text-sm text-rose-500 font-bold bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-100">Esta ação excluirá {billingIdsToDelete.length} cobranças agrupadas.</span>
                  </>
                )}
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setIsBillingDeleteModalOpen(false);
                    setBillingIdsToDelete([]);
                    setBillingToDeleteInfo(null);
                  }}
                  className="flex-1 px-6 py-4 bg-slate-100 text-slate-600 rounded-3xl font-bold hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDeleteBilling}
                  className="flex-1 px-6 py-4 bg-rose-600 text-white rounded-3xl font-bold hover:bg-rose-700 transition-all shadow-xl shadow-rose-200"
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsModalOpen && (
          <SettingsForm onClose={() => setIsSettingsModalOpen(false)} />
        )}
      </AnimatePresence>

      {/* WhatsApp Central Modal */}
      <AnimatePresence>
        {isWhatsAppModalOpen && (
          <WhatsAppNotificationModal
            properties={properties}
            billings={billings}
            onClose={() => setIsWhatsAppModalOpen(false)}
            onOpenSettings={() => setIsWhatsAppSettingsModalOpen(true)}
          />
        )}
      </AnimatePresence>

      {/* WhatsApp Settings Modal */}
      <AnimatePresence>
        {isWhatsAppSettingsModalOpen && (
          <WhatsAppSettingsModal
            onClose={() => setIsWhatsAppSettingsModalOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Backup and Restore Modal */}
      <AnimatePresence>
        {isBackupModalOpen && (
          <BackupRestoreModal
            onClose={() => setIsBackupModalOpen(false)}
            onRefreshData={() => {
              window.location.reload();
            }}
          />
        )}
      </AnimatePresence>

      {/* Condo Rent Report Modal */}
      <AnimatePresence>
        {isCondoReportModalOpen && (
          <CondoRentReportModal
            billings={billings}
            properties={properties}
            onClose={() => setIsCondoReportModalOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* End Contract Confirmation Modal */}
      <AnimatePresence>
        {isEndContractModalOpen && propertyToEndContract && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[40px] p-10 max-w-md w-full shadow-2xl border border-slate-100"
            >
              <div className="bg-amber-50 w-20 h-20 rounded-3xl flex items-center justify-center mb-8 text-amber-600 shadow-inner shadow-amber-100">
                <UserMinus size={40} />
              </div>
              <h3 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Encerrar Contrato?</h3>
              <p className="text-slate-500 mb-10 font-medium leading-relaxed">
                Deseja realmente encerrar o contrato de <span className="font-black text-slate-900">{propertyToEndContract.ownerName}</span> no imóvel <span className="font-black text-slate-900">{propertyToEndContract.propertyCode}</span>? 
                <br /><br />
                As cobranças pendentes serão mantidas no histórico.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setIsEndContractModalOpen(false);
                    setPropertyToEndContract(null);
                  }}
                  className="flex-1 px-6 py-4 bg-slate-100 text-slate-600 rounded-3xl font-bold hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleEndContract(propertyToEndContract)}
                  className="flex-1 px-6 py-4 bg-amber-600 text-white rounded-3xl font-bold hover:bg-amber-700 transition-all shadow-xl shadow-amber-200"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <AppContent />
  );
}
