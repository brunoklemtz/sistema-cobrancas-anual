import React, { useState, useEffect } from 'react';
import { 
  addDoc, 
  setDoc, 
  serverTimestamp,
  Timestamp,
  getDoc,
  getDocs,
  deleteDoc,
  DocTable
} from '../lib/db';
import { BillingRecord, Property, OperationType, Settings, PaymentEntry } from '../types';
import { handleFirestoreError, parseDate } from '../utils/firestore';
import { isBalanceItem, isDepositItem, syncSubsequentBillingsBalances, getPreviousUnpaidBalance } from '../utils/billingUtils';
import { X, DollarSign, Calendar, Droplets, Zap, Save, Calculator, Plus, FileText, CheckCircle, AlertCircle, CreditCard, Trash2, ChevronDown, ChevronUp, Edit2, Check, Shield } from 'lucide-react';
import { format, addDays, isBefore, startOfDay } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

interface BillingFormProps {
  billing?: BillingRecord | null;
  properties: Property[];
  onClose: () => void;
  defaultPropertyId?: string;
}

const DEFAULT_SETTINGS: Settings = {
  waterBasePrice: 56.00,
  waterBaseLimit: 5,
  waterTiers: [
    { min: 5, max: 10, rate: 12.85 },
    { min: 10, max: 15, rate: 14.47 },
    { min: 15, max: 20, rate: 24.45 },
    { min: 20, max: 25, rate: 24.99 },
    { min: 25, max: null, rate: 24.62 },
  ],
  electricityBasePrice: 0,
  electricityBaseLimit: 0,
  electricityTiers: [
    { min: 0, max: null, rate: 0.88 }
  ],
};

interface BillingDraft {
  amount: string;
  previousReading: string;
  currentReading: string;
  notes: string;
  customRate?: string;
  otherItems?: { amount: string, notes: string }[];
}

export default function BillingForm({ billing, properties, onClose, defaultPropertyId }: BillingFormProps) {
  const [propertyId, setPropertyId] = useState(billing?.propertyId || defaultPropertyId || '');
  const [type, setType] = useState<'water' | 'electricity' | 'rent' | 'other'>('water');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [previousReading, setPreviousReading] = useState('');
  const [currentReading, setCurrentReading] = useState('');
  const [otherItems, setOtherItems] = useState<{ amount: string, notes: string }[]>([{ amount: '', notes: '' }]);
  const [customRate, setCustomRate] = useState<string>('');
  const [showRateCalculator, setShowRateCalculator] = useState<boolean>(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [readingDate, setReadingDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dueDate, setDueDate] = useState(
    billing?.dueDate ? format(parseDate(billing.dueDate) || new Date(), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')
  );
  const [status, setStatus] = useState<'pending' | 'paid' | 'overdue'>(billing?.status || 'pending');
  const [paidAmount, setPaidAmount] = useState(billing?.paidAmount?.toString() || '');
  const [paymentHistory, setPaymentHistory] = useState<PaymentEntry[]>(billing?.paymentHistory || []);
  const [showPartialHistory, setShowPartialHistory] = useState(false);
  const [partialPayDate, setPartialPayDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [partialPayAmount, setPartialPayAmount] = useState('');
  const [partialPayNotes, setPartialPayNotes] = useState('');
  const [editingPartialId, setEditingPartialId] = useState<string | null>(null);
  const [editingPartialDate, setEditingPartialDate] = useState('');
  const [editingPartialAmount, setEditingPartialAmount] = useState('');
  const [editingPartialNotes, setEditingPartialNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReadingDateManual, setIsReadingDateManual] = useState(false);
  const [isDueDateManual, setIsDueDateManual] = useState(false);
  const [initialPreviousBalance, setInitialPreviousBalance] = useState<number>(0);
  const [calculationBreakdown, setCalculationBreakdown] = useState<string>('');
  const [drafts, setDrafts] = useState<Record<string, BillingDraft>>({});

  const parseValue = (val: string | number) => {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return val;
    
    // Handle both formats: 1.234,56 and 1234.56
    const sanitized = val.includes(',') 
      ? val.replace(/\./g, '').replace(',', '.') 
      : val;
      
    const parsed = parseFloat(sanitized);
    const result = isNaN(parsed) ? 0 : parsed;
    // Round to 2 decimal places to avoid floating point issues
    return Math.round((result + Number.EPSILON) * 100) / 100;
  };

  useEffect(() => {
    if (billing) {
      setPropertyId(billing.propertyId || '');
      const isVirtual = (billing as any).isVirtual;
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      if (isVirtual || !billing.readingDate) {
        setReadingDate(todayStr);
      } else {
        const bDate = parseDate(billing.readingDate) || new Date();
        const bDateStr = format(bDate, 'yyyy-MM-dd');
        if (isBefore(new Date(), bDate) && bDateStr !== todayStr) {
          setReadingDate(todayStr);
        } else {
          setReadingDate(bDateStr);
        }
      }
      setDueDate(billing.dueDate ? format(parseDate(billing.dueDate) || new Date(), 'yyyy-MM-dd') : todayStr);
      let initialStatus = billing.status || 'pending';
      if (initialStatus === 'pending' && billing.dueDate) {
        const today = startOfDay(new Date());
        const due = parseDate(billing.dueDate);
        if (due && isBefore(due, today)) {
          initialStatus = 'overdue';
        }
      }
      setStatus(initialStatus);
      setPaidAmount(billing.paidAmount?.toString() || '');
      setPaymentHistory(billing.paymentHistory || []);
      setIsReadingDateManual(true);
      setIsDueDateManual(true);
      
      // Load items into drafts
      const newDrafts: Record<string, BillingDraft> = {};
      const items = billing.items || [];
      
      if (items.length > 0) {
        // Group items by type for drafts
        const groupedItems: Record<string, any[]> = {};
        items.forEach(item => {
          if (!groupedItems[item.type]) groupedItems[item.type] = [];
          groupedItems[item.type].push(item);
        });

        Object.entries(groupedItems).forEach(([t, tItems]) => {
          if (t === 'other') {
            const userOtherItems = tItems
              .map(item => ({
                amount: item.amount.toString(),
                notes: item.notes || '',
                isManuallyEdited: item.isManuallyEdited,
              }));
            if (userOtherItems.length > 0) {
              newDrafts[t] = {
                amount: '0',
                notes: '',
                previousReading: '',
                currentReading: '',
                otherItems: userOtherItems
              };
            }
          } else {
            const item = tItems[0]; // Take first for water/elec/rent
            newDrafts[t] = {
              amount: item.amount.toString(),
              notes: item.notes || '',
              previousReading: item.previousReading?.toString() || '',
              currentReading: item.currentReading?.toString() || '',
            };
          }
        });
      } else if ((billing as any).type) {
        // Handle old single-type record
        const oldType = (billing as any).type;
        newDrafts[oldType] = {
          amount: (billing as any).amount?.toString() || '0',
          notes: (billing as any).notes || '',
          previousReading: (billing as any).previousReading?.toString() || '',
          currentReading: (billing as any).currentReading?.toString() || '',
        };
      }
      
      setDrafts(newDrafts);
      
      // Set initial tab to the first item type or water
      const firstType = items[0]?.type || (billing as any).type || 'water';
      setType(firstType);
      const firstDraft = newDrafts[firstType];
      if (firstDraft) {
        setAmount(firstDraft.amount || '');
        setNotes(firstDraft.notes || '');
        setPreviousReading(firstDraft.previousReading || '');
        setCurrentReading(firstDraft.currentReading || '');
        setCustomRate(firstDraft.customRate || '');
      }
      if (newDrafts['other']?.otherItems && newDrafts['other'].otherItems.length > 0) {
        setOtherItems(newDrafts['other'].otherItems);
      }
    } else {
      setPropertyId(defaultPropertyId || '');
      setType('water');
      setAmount('');
      setNotes('');
      setPreviousReading('');
      setCurrentReading('');
      setOtherItems([{ amount: '', notes: '' }]);
      setReadingDate(format(new Date(), 'yyyy-MM-dd'));
      setDueDate(format(new Date(), 'yyyy-MM-dd'));
      setStatus('pending');
      setPaidAmount('');
      setPaymentHistory([]);
      setIsReadingDateManual(false);
      setIsDueDateManual(false);
      setDrafts({});
    }
  }, [billing]);

  useEffect(() => {
    // Reset manual flags and form state when property changes for a new billing
    if (!billing && propertyId) {
      setIsReadingDateManual(false);
      setIsDueDateManual(false);
      setAmount('');
      setNotes('');
      setPreviousReading('');
      setCurrentReading('');
      setOtherItems([{ amount: '', notes: '' }]);
      setDrafts({});
    }
  }, [propertyId, billing]);

  const defaultRate = React.useMemo(() => {
    if (!settings) return type === 'water' ? 12.85 : 0.88;
    const rawTiers = type === 'water' ? settings.waterTiers : settings.electricityTiers;
    if (rawTiers && rawTiers.length > 0 && rawTiers[0].rate) {
      return Number(rawTiers[0].rate);
    }
    return type === 'water' ? 12.85 : 0.88;
  }, [settings, type]);

  const currentTotal = React.useMemo(() => {
    let tot = 0;
    
    // Add current active tab amount if water / electricity / rent
    if (type !== 'other') {
      const val = parseValue(amount);
      if (!isNaN(val) && val > 0) tot += val;
    }

    // Always include otherItems (master state for additional items such as Caução / Saldo Devedor)
    const activeOtherPool = (type === 'other') 
      ? otherItems 
      : (otherItems && otherItems.some(i => i.amount || i.notes) ? otherItems : (drafts['other']?.otherItems || otherItems));

    activeOtherPool.forEach(i => {
      const val = parseValue(i.amount);
      if (!isNaN(val)) tot += val;
    });

    // Sum other non-active tabs from drafts (water, electricity, rent)
    (Object.entries(drafts) as [string, BillingDraft][]).forEach(([t, d]) => {
      if (t === type || t === 'other') return;
      const val = parseValue(d.amount);
      if (!isNaN(val) && val > 0) tot += val;
    });

    return Math.round((tot + Number.EPSILON) * 100) / 100;
  }, [type, amount, otherItems, drafts]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc('settings', 'global');
        if (docSnap) {
          setSettings(docSnap as unknown as Settings);
        } else {
          console.log('No settings found, using defaults');
          setSettings(DEFAULT_SETTINGS);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
        setSettings(DEFAULT_SETTINGS);
      }
    };
    fetchSettings();
  }, []);

  // Fetch last reading when property or type changes
  useEffect(() => {
    if ((billing && !(billing as any).isVirtual) || !propertyId || !type) return;
    if (type !== 'water' && type !== 'electricity') return;
    
    // Skip if we already have a previous reading in draft for this specific type
    if (drafts[type]?.previousReading) return;

    const fetchLastReading = async () => {
      try {
        let pData = properties.find(p => p.id === propertyId);
        if (!pData) {
          const propertyDoc = await getDoc('properties', propertyId);
          if (propertyDoc) {
            pData = propertyDoc as Property;
          }
        }

        const currentTenantName = pData?.ownerName || '';
        const leaseStart = parseDate(pData?.leaseStartDate);

        // Fetch billings for this property
        const querySnapshot = await getDocs('billings', {
          filters: [{ field: 'propertyId', op: 'eq', value: propertyId }],
        });
        
        // Filter and sort in memory to avoid composite index requirement
        const propertyBillings = querySnapshot
          .map(d => d as any) // Use any to handle both old and new structures
          .filter(b => {
            const hasType = b.type === type || (b.items && b.items.some((i: any) => i.type === type));
            if (!hasType) return false;

            // Only consider billings for the CURRENT active tenant
            if (currentTenantName && b.tenantName && b.tenantName.trim().toLowerCase() !== currentTenantName.trim().toLowerCase()) {
              return false;
            }

            // If we have a lease start date, only consider billings from this contract period
            if (leaseStart && b.dueDate) {
              const billingDate = parseDate(b.dueDate);
              if (billingDate && isBefore(billingDate, leaseStart)) {
                return false;
              }
            }

            return true;
          })
          .sort((a, b) => {
            const dateA = a.readingDate || a.items?.find((i: any) => i.type === type)?.readingDate;
            const dateB = b.readingDate || b.items?.find((i: any) => i.type === type)?.readingDate;
            return (parseDate(dateB)?.getTime() || 0) - (parseDate(dateA)?.getTime() || 0);
          });
        
        let foundReading: number | null = null;
        let foundReadingDate: any = null;

        for (const b of propertyBillings) {
          const item = b.items?.find((i: any) => i.type === type);
          if (item) {
            if (typeof item.currentReading === 'number' && !isNaN(item.currentReading) && item.currentReading > 0) {
              foundReading = item.currentReading;
              foundReadingDate = item.readingDate || b.readingDate || b.dueDate;
              break;
            } else if (typeof item.previousReading === 'number' && !isNaN(item.previousReading) && item.previousReading > 0) {
              if (foundReading === null) {
                foundReading = item.previousReading;
                foundReadingDate = item.readingDate || b.readingDate || b.dueDate;
              }
            }
          } else if (b.type === type && typeof b.currentReading === 'number' && !isNaN(b.currentReading) && b.currentReading > 0) {
            foundReading = b.currentReading;
            foundReadingDate = b.readingDate || b.dueDate;
            break;
          }
        }

        if (foundReading === null) {
          // Check all billings for this property regardless of tenant name to pick up the meter reading
          const allPropBillings = querySnapshot
            .map(d => d as any)
            .filter(b => b.type === type || (b.items && b.items.some((i: any) => i.type === type)))
            .sort((a, b) => {
              const dateA = a.readingDate || a.items?.find((i: any) => i.type === type)?.readingDate || a.dueDate || a.createdAt;
              const dateB = b.readingDate || b.items?.find((i: any) => i.type === type)?.readingDate || b.dueDate || b.createdAt;
              return (parseDate(dateB)?.getTime() || 0) - (parseDate(dateA)?.getTime() || 0);
            });

          for (const b of allPropBillings) {
            const item = b.items?.find((i: any) => i.type === type);
            if (item) {
              if (typeof item.currentReading === 'number' && !isNaN(item.currentReading) && item.currentReading > 0) {
                foundReading = item.currentReading;
                break;
              } else if (typeof item.previousReading === 'number' && !isNaN(item.previousReading) && item.previousReading > 0) {
                foundReading = item.previousReading;
                break;
              }
            } else if (b.type === type && typeof b.currentReading === 'number' && !isNaN(b.currentReading) && b.currentReading > 0) {
              foundReading = b.currentReading;
              break;
            }
          }
        }

        if (foundReading !== null) {
          console.log(`Found previous reading for ${type}: ${foundReading}`);
          setPreviousReading(foundReading.toString());
        } else {
          // If no previous billing had a reading for this type, fetch property initial reading
          console.log(`No previous billing found for ${type}, checking property initial data`);
          if (pData) {
            const initial = type === 'water' 
              ? pData.initialWaterReading 
              : pData.initialElectricityReading;
            
            if (initial !== undefined && initial !== null) {
              setPreviousReading(initial.toString());
            } else {
              setPreviousReading('0');
            }
          } else {
            setPreviousReading('0');
          }
        }
      } catch (error) {
        console.error('Error fetching last reading:', error);
      }
    };

    fetchLastReading();
  }, [propertyId, type, billing]);

  // Fetch previous balance when property, due date or reading date changes (for NEW/VIRTUAL billings only)
  useEffect(() => {
    if (!propertyId) return;
    if (billing && !(billing as any).isVirtual) return;

    const fetchPreviousBalance = async () => {
      try {
        let targetDueDate: Date | undefined = undefined;
        if (billing?.dueDate) {
          targetDueDate = parseDate(billing.dueDate) || undefined;
        } else if (dueDate) {
          targetDueDate = new Date(dueDate);
        } else if (readingDate) {
          targetDueDate = addDays(new Date(readingDate), 10);
        }

        const netDifference = await getPreviousUnpaidBalance(propertyId, targetDueDate);
        setInitialPreviousBalance(netDifference);
        
        let balanceItem: { amount: string; notes: string } | null = null;

        if (netDifference > 0.01) {
          const balanceStr = netDifference.toFixed(2).replace('.', ',');
          const balanceNote = `Saldo Devedor Anterior Acumulado`;
          balanceItem = { amount: balanceStr, notes: balanceNote };
        } else if (netDifference < -0.01) {
          const creditVal = Math.abs(netDifference);
          const balanceStr = `-${creditVal.toFixed(2).replace('.', ',')}`;
          const balanceNote = `Saldo Positivo Anterior (Crédito)`;
          balanceItem = { amount: balanceStr, notes: balanceNote };
        }

        setOtherItems(prev => {
          const existingIdx = prev.findIndex(isBalanceItem);

          if (existingIdx !== -1 && (prev[existingIdx] as any).isManuallyEdited) {
            return prev;
          }

          if (balanceItem) {
            if (existingIdx !== -1) {
              const updated = [...prev];
              updated[existingIdx] = balanceItem;
              return updated;
            } else {
              if (prev.length === 1 && prev[0].amount === '' && prev[0].notes === '') {
                return [balanceItem];
              }
              return [...prev, balanceItem];
            }
          } else {
            if (existingIdx !== -1) {
              const filtered = prev.filter((_, idx) => idx !== existingIdx);
              return filtered.length > 0 ? filtered : [{ amount: '', notes: '' }];
            }
            return prev;
          }
        });

        setDrafts(prev => {
          const currentOtherDraft = prev['other'] || { 
            amount: '', 
            notes: '', 
            previousReading: '', 
            currentReading: '', 
            otherItems: [{ amount: '', notes: '' }] 
          };

          const existingItems = currentOtherDraft.otherItems || [{ amount: '', notes: '' }];
          const existingIdx = existingItems.findIndex(isBalanceItem);

          if (existingIdx !== -1 && (existingItems[existingIdx] as any).isManuallyEdited) {
            return prev;
          }

          let newOtherItems: { amount: string; notes: string; isManuallyEdited?: boolean }[];

          if (balanceItem) {
            if (existingIdx !== -1) {
              newOtherItems = [...existingItems];
              newOtherItems[existingIdx] = balanceItem;
            } else if (existingItems.length === 1 && existingItems[0].amount === '' && existingItems[0].notes === '') {
              newOtherItems = [balanceItem];
            } else {
              newOtherItems = [...existingItems, balanceItem];
            }
          } else {
            if (existingIdx !== -1) {
              newOtherItems = existingItems.filter((_, idx) => idx !== existingIdx);
              if (newOtherItems.length === 0) newOtherItems = [{ amount: '', notes: '' }];
            } else {
              newOtherItems = existingItems;
            }
          }

          return {
            ...prev,
            'other': {
              ...currentOtherDraft,
              otherItems: newOtherItems
            }
          };
        });
      } catch (error) {
        console.error('Error fetching previous balance:', error);
      }
    };

    fetchPreviousBalance();
  }, [propertyId, billing, properties, dueDate, readingDate]);

  // Set rent amount from property data when type is 'rent'
  useEffect(() => {
    if (type === 'rent' && propertyId && !billing) {
      const property = properties.find(p => p.id === propertyId);
      if (property?.rentAmount) {
        setAmount(property.rentAmount.toFixed(2));
      } else {
        setAmount('');
      }
    }
  }, [type, propertyId, properties, billing]);

  const selectedProperty = properties.find(p => p.id === propertyId);
  const isDepositIncluded = (otherItems && otherItems.some(isDepositItem)) || (drafts['other']?.otherItems?.some(isDepositItem) || false);

  const handleToggleDepositInInvoice = () => {
    if (!selectedProperty || !selectedProperty.securityDepositAmount) return;

    // Merge items from otherItems AND drafts['other']?.otherItems to avoid losing any items
    const pool1 = otherItems || [];
    const pool2 = drafts['other']?.otherItems || [];
    const combinedPool = [...pool1];
    
    pool2.forEach(item2 => {
      if (!combinedPool.some(i => i.notes === item2.notes && i.amount === item2.amount)) {
        combinedPool.push(item2);
      }
    });

    const activeItemsPool = combinedPool.filter(i => i.amount !== '' || i.notes !== '');

    const currentlyIncluded = activeItemsPool.some(isDepositItem);

    let newItems: { amount: string; notes: string; isManuallyEdited?: boolean }[] = [];

    if (currentlyIncluded) {
      // User wants to REMOVE deposit
      const filtered = activeItemsPool.filter(item => !isDepositItem(item));
      newItems = filtered.length > 0 ? filtered : [{ amount: '', notes: '' }];
    } else {
      // User wants to ADD deposit
      const depositStr = selectedProperty.securityDepositAmount.toFixed(2).replace('.', ',');
      const depositItem = { amount: depositStr, notes: 'Caução (Garantia)', isManuallyEdited: true };

      // Keep existing non-empty items (such as Saldo Devedor)
      const nonEmptyExisting = activeItemsPool.filter(item => !isDepositItem(item) && ((item.amount !== '' && item.amount !== '0,00' && item.amount !== '0') || item.notes !== ''));

      newItems = [...nonEmptyExisting, depositItem];
    }

    setOtherItems(newItems);
    setDrafts(prev => ({
      ...prev,
      'other': {
        ...(prev['other'] || { amount: '', notes: '', previousReading: '', currentReading: '' }),
        otherItems: newItems
      }
    }));
  };

  // Automatic calculation
  useEffect(() => {
    if (!settings || (type !== 'water' && type !== 'electricity')) return;
    
    const prev = parseValue(previousReading);
    const curr = parseValue(currentReading);
    
    console.log(`Calculating ${type}: prev=${prev}, curr=${curr}, customRate=${customRate}`);

    if (!isNaN(prev) && !isNaN(curr) && curr >= prev) {
      const consumption = Math.round((curr - prev + Number.EPSILON) * 100) / 100;
      const basePrice = Number(type === 'water' ? settings.waterBasePrice : settings.electricityBasePrice) || 0;
      const baseLimit = Number(type === 'water' ? settings.waterBaseLimit : settings.electricityBaseLimit) || 0;

      // Check if user entered a custom tariff rate per unit
      const customRateVal = parseValue(customRate);
      if (!isNaN(customRateVal) && customRateVal > 0) {
        let calculatedAmount = basePrice > 0 ? basePrice : 0;
        let breakdownParts: string[] = [];
        if (basePrice > 0) {
          breakdownParts.push(`R$ ${basePrice.toFixed(2)} (base)`);
        }
        calculatedAmount += consumption * customRateVal;
        breakdownParts.push(`(${consumption} ${type === 'water' ? 'm³' : 'kWh'} x R$ ${customRateVal.toFixed(2)})`);

        const roundedAmount = Math.round((calculatedAmount + Number.EPSILON) * 100) / 100;
        const breakdown = breakdownParts.join(' + ');
        setAmount(roundedAmount.toFixed(2));
        setCalculationBreakdown(breakdown || `R$ 0.00`);
        return;
      }

      let rawTiers = type === 'water' ? settings.waterTiers : settings.electricityTiers;

      // Fallback for electricity if tiers are empty
      if (type === 'electricity' && (!rawTiers || rawTiers.length === 0)) {
        rawTiers = [{ min: 0, max: null, rate: 0.88 }];
      }

      const tiers = (rawTiers || []).map(t => ({
        min: Number(t.min) || 0,
        max: t.max === null || t.max === undefined || t.max === '' || Number(t.max) === 0 ? null : Number(t.max),
        rate: Number(t.rate) || 0
      }));

      let calculatedAmount = 0;
      let breakdownParts: string[] = [];
      
      if (basePrice > 0) {
        calculatedAmount = basePrice;
        breakdownParts.push(`R$ ${basePrice.toFixed(2)} (${consumption <= baseLimit ? 'mínimo' : 'base'})`);
      }
      
      if (consumption > baseLimit) {
        // Sort tiers by min to ensure correct order
        const sortedTiers = [...tiers].sort((a, b) => a.min - b.min);
        
        for (const tier of sortedTiers) {
          const tierStart = tier.min;
          const tierEnd = tier.max ?? Infinity;
          
          const overlapStart = Math.max(baseLimit, tierStart);
          const overlapEnd = Math.min(consumption, tierEnd);
          
          const unitsInTier = Math.max(0, Math.round((overlapEnd - overlapStart + Number.EPSILON) * 100) / 100);
          
          if (unitsInTier > 0) {
            calculatedAmount += unitsInTier * tier.rate;
            breakdownParts.push(`(${unitsInTier} x R$ ${tier.rate.toFixed(2)})`);
          }
        }
      }
      
      const roundedAmount = Math.round((calculatedAmount + Number.EPSILON) * 100) / 100;
      const breakdown = breakdownParts.join(' + ');
      setAmount(roundedAmount.toFixed(2));
      setCalculationBreakdown(breakdown || `R$ 0.00`);
    } else {
      setCalculationBreakdown('');
    }
  }, [previousReading, currentReading, type, settings, customRate]);

  const handleAddPartialPayment = () => {
    const val = parseValue(partialPayAmount);
    if (val <= 0) return;
    const newEntry: PaymentEntry = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
      amount: val,
      date: partialPayDate || format(new Date(), 'yyyy-MM-dd'),
      notes: partialPayNotes.trim(),
      registeredAt: new Date().toISOString()
    };
    const updated = [...paymentHistory, newEntry];
    setPaymentHistory(updated);
    const totalPaid = updated.reduce((sum, p) => sum + (p.amount || 0), 0);
    setPaidAmount(totalPaid.toFixed(2));
    setPartialPayAmount('');
    setPartialPayNotes('');
  };

  const handleRemovePartialPayment = (id: string) => {
    const updated = paymentHistory.filter(p => p.id !== id);
    setPaymentHistory(updated);
    const totalPaid = updated.reduce((sum, p) => sum + (p.amount || 0), 0);
    setPaidAmount(totalPaid > 0 ? totalPaid.toFixed(2) : '');
    if (editingPartialId === id) setEditingPartialId(null);
  };

  const handleStartEditPartial = (p: PaymentEntry) => {
    setEditingPartialId(p.id);
    setEditingPartialDate(p.date || format(new Date(), 'yyyy-MM-dd'));
    setEditingPartialAmount(p.amount ? p.amount.toString().replace('.', ',') : '');
    setEditingPartialNotes(p.notes || '');
  };

  const handleSaveEditPartial = () => {
    if (!editingPartialId) return;
    const val = parseValue(editingPartialAmount);
    if (val <= 0) return;
    const updated = paymentHistory.map(p => {
      if (p.id === editingPartialId) {
        return {
          ...p,
          amount: val,
          date: editingPartialDate || p.date,
          notes: editingPartialNotes.trim()
        };
      }
      return p;
    });
    setPaymentHistory(updated);
    const totalPaid = updated.reduce((sum, p) => sum + (p.amount || 0), 0);
    setPaidAmount(totalPaid > 0 ? totalPaid.toFixed(2) : '');
    setEditingPartialId(null);
  };

  const handleCancelEditPartial = () => {
    setEditingPartialId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId) return;
    setLoading(true);
    const path: DocTable = 'billings';

    try {
      // Collect all items to save
      const itemsToSave = [];
      let totalAmount = 0;

      // Add current tab data to drafts first to ensure it's included
      const activeOtherItems = (otherItems && otherItems.some(i => i.amount || i.notes))
        ? otherItems
        : (drafts['other']?.otherItems || otherItems);

      const currentDrafts = {
        ...drafts,
        [type]: {
          amount,
          notes,
          previousReading,
          currentReading,
          customRate,
          otherItems: type === 'other' ? activeOtherItems : (drafts[type]?.otherItems || activeOtherItems)
        },
        'other': {
          ...(drafts['other'] || { amount: '', notes: '', previousReading: '', currentReading: '' }),
          otherItems: activeOtherItems
        }
      };

      // Process all drafts
      (Object.entries(currentDrafts) as [string, BillingDraft][]).forEach(([t, d]) => {
        if (t === 'water' || t === 'electricity') {
          const prev = parseValue(d.previousReading);
          const curr = parseValue(d.currentReading);
          if (curr > 0 && curr < prev) {
            throw new Error(`Na aba ${t === 'water' ? 'Água' : 'Luz'}, a leitura atual não pode ser menor que a leitura anterior.`);
          }
        }

        if (t === 'other' && d.otherItems) {
          d.otherItems.forEach(item => {
            const itemAmount = parseValue(item.amount);
            if (!isNaN(itemAmount) && itemAmount !== 0) {
              const isBal = isBalanceItem(item);
              const isDep = isDepositItem(item);
              itemsToSave.push({
                type: 'other',
                amount: itemAmount,
                notes: item.notes || '',
                isManuallyEdited: (item as any).isManuallyEdited || isBal || isDep,
              });
              totalAmount += itemAmount;
            }
          });
        } else {
          const draftAmount = parseValue(d.amount);
          if (draftAmount > 0) {
            itemsToSave.push({
              type: t as any,
              amount: draftAmount,
              notes: d.notes || '',
              previousReading: d.previousReading ? parseValue(d.previousReading) : null,
              currentReading: d.currentReading ? parseValue(d.currentReading) : null,
            });
            totalAmount += draftAmount;
          }
        }
      });

      // Final rounding for totalAmount to avoid floating point precision issues
      totalAmount = Math.round((totalAmount + Number.EPSILON) * 100) / 100;

      if (itemsToSave.length === 0) {
        setError('Por favor, preencha pelo menos uma cobrança com valor maior que zero.');
        setLoading(false);
        return;
      }

      const property = properties.find(p => p.id === propertyId);
      const tenantName = billing?.tenantName || property?.ownerName || 'Desconhecido';
      const propertyCode = property?.propertyCode || 'N/A';
      const tenantPhone = property?.phone || '';

      let finalPaidAmount = parseValue(paidAmount);

      // Only default to totalAmount if user selected 'paid' AND left paidAmount completely blank
      if (status === 'paid' && paidAmount.trim() === '') {
        finalPaidAmount = totalAmount;
      }

      let finalHistory = [...paymentHistory];
      const historySum = finalHistory.reduce((acc, h) => acc + (h.amount || 0), 0);

      if (finalPaidAmount > 0 && Math.abs(historySum - finalPaidAmount) > 0.01) {
        if (finalHistory.length === 0) {
          finalHistory = [{
            id: Date.now().toString(),
            amount: finalPaidAmount,
            date: format(new Date(), 'yyyy-MM-dd'),
            notes: 'Pagamento informado na cobrança',
            registeredAt: new Date().toISOString()
          }];
        } else {
          const diff = finalPaidAmount - historySum;
          if (diff > 0) {
            finalHistory.push({
              id: Date.now().toString(),
              amount: Math.round((diff + Number.EPSILON) * 100) / 100,
              date: format(new Date(), 'yyyy-MM-dd'),
              notes: 'Ajuste / Valor adicional pago',
              registeredAt: new Date().toISOString()
            });
          } else {
            finalHistory = [{
              id: Date.now().toString(),
              amount: finalPaidAmount,
              date: format(new Date(), 'yyyy-MM-dd'),
              notes: 'Pagamento atualizado na cobrança',
              registeredAt: new Date().toISOString()
            }];
          }
        }
      } else if (finalPaidAmount === 0 && paidAmount.trim() !== '') {
        finalHistory = [];
      }

      let calculatedStatus: 'paid' | 'pending' | 'overdue' = status;
      if (finalPaidAmount >= totalAmount - 0.01 && totalAmount > 0) {
        calculatedStatus = 'paid';
      } else {
        const today = startOfDay(new Date());
        const due = new Date(dueDate + 'T12:00:00');
        if (isBefore(due, today)) {
          calculatedStatus = 'overdue';
        } else {
          calculatedStatus = 'pending';
        }
      }

      const hasBalanceItemToSave = itemsToSave.some(item => isBalanceItem(item));
      const userRemovedBalanceItem = !hasBalanceItemToSave && (
        (billing?.items?.some(i => isBalanceItem(i)) || false) ||
        (initialPreviousBalance !== 0) ||
        (billing?.userRemovedBalanceItem || false)
      );

      const data = {
        propertyId,
        propertyCode,
        tenantName,
        tenantPhone,
        items: itemsToSave,
        totalAmount,
        paidAmount: finalPaidAmount,
        paymentHistory: finalHistory,
        readingDate: Timestamp.fromDate(new Date(readingDate + 'T12:00:00')),
        dueDate: Timestamp.fromDate(new Date(dueDate + 'T12:00:00')),
        status: calculatedStatus,
        userRemovedBalanceItem,
        updatedAt: serverTimestamp(),
      };

      if (billing && billing.id && !(billing as any).isVirtual) {
        console.log(`Updating billing with ID: ${billing.id}`);
        await setDoc(path, billing.id, data, { merge: true });
        
        // If it was a grouped record, delete the others to consolidate
        if (billing.ids && billing.ids.length > 1) {
          const otherIds = billing.ids.filter(id => id !== billing.id);
          console.log(`Deleting other records in group to consolidate: ${otherIds.join(', ')}`);
          await Promise.all(otherIds.map(id => deleteDoc(path, id)));
        }
      } else {
        console.log(`Creating new combined billing (from ${billing && (billing as any).isVirtual ? 'virtual' : 'scratch'})`);
        await addDoc(path, {
          ...data,
          createdAt: serverTimestamp(),
        });
      }

      await syncSubsequentBillingsBalances(propertyId);

      onClose();
    } catch (err: any) {
      console.error('Error saving billing:', err);
      let message = 'Ocorreu um erro ao salvar a cobrança.';
      
      const isPermissionError = 
        err.code === 'permission-denied' || 
        err.message?.toLowerCase().includes('permission') ||
        err.message?.toLowerCase().includes('insufficient');

      if (isPermissionError) {
        message = 'Você não tem permissão para realizar esta ação. Verifique se você é um administrador.';
      } else if (err.message) {
        message = `Erro: ${err.message}`;
      }
      
      setError(message);
      try {
        handleFirestoreError(err, billing ? OperationType.UPDATE : OperationType.CREATE, path);
      } catch (e) {}
    } finally {
      setLoading(false);
    }
  };

  const handleTypeChange = (newType: 'water' | 'electricity' | 'rent' | 'other') => {
    if (newType === type) return;
    
    const activeOtherPool = (otherItems && otherItems.some(i => i.amount || i.notes))
      ? otherItems
      : (drafts['other']?.otherItems || otherItems);

    // Save current state to drafts
    const currentData: BillingDraft = {
      amount,
      notes,
      previousReading,
      currentReading,
      customRate,
      otherItems: activeOtherPool
    };
    
    setDrafts(prev => ({
      ...prev,
      [type]: currentData,
      'other': {
        ...(prev['other'] || { amount: '', notes: '', previousReading: '', currentReading: '' }),
        otherItems: activeOtherPool
      }
    }));
    
    setType(newType);
    
    // Load from drafts if exists
    const draft = drafts[newType];
    if (draft) {
      setAmount(draft.amount || '');
      setNotes(draft.notes || '');
      setPreviousReading(draft.previousReading || '');
      setCurrentReading(draft.currentReading || '');
      setCustomRate(draft.customRate || '');
      if (draft.otherItems) {
        setOtherItems(draft.otherItems);
      }
    } else if (!billing) {
      // Reset if no draft and not editing
      setAmount('');
      setNotes('');
      setPreviousReading('');
      setCurrentReading('');
      setCustomRate('');
      if (newType === 'other') {
        setOtherItems(activeOtherPool);
      }
      
      // If switching to rent, try to pre-populate from property
      if (newType === 'rent' && propertyId) {
        const property = properties.find(p => p.id === propertyId);
        if (property?.rentAmount) {
          setAmount(property.rentAmount.toFixed(2));
        }
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-4xl p-8 shadow-2xl my-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
              {billing ? 'Editar Cobrança' : 'Nova Cobrança'}
            </h2>
            <p className="text-sm text-gray-400 font-medium">Preencha os dados abaixo para gerenciar as cobranças</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X size={24} className="text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {error && (
            <div className="p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-2xl flex items-center gap-3">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            {/* Left Column: Basic Info & Readings */}
            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em]">Informações Básicas</h3>
                
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Imóvel / Locatário</label>
                  <select
                    required
                    value={propertyId}
                    onChange={(e) => setPropertyId(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-medium text-gray-900"
                  >
                    <option value="">Selecione um imóvel</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.propertyCode} — {p.ownerName}
                      </option>
                    ))}
                  </select>

                  {selectedProperty && (selectedProperty.securityDepositAmount || 0) > 0 && (
                    <div className={`p-3.5 rounded-2xl border transition-all mt-2.5 ${
                      selectedProperty.securityDepositPaid 
                        ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900' 
                        : 'bg-purple-50/80 border-purple-200 text-purple-900'
                    }`}>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2.5">
                          <Shield size={18} className={selectedProperty.securityDepositPaid ? 'text-emerald-600' : 'text-purple-600'} />
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                              Caução (Garantia do Contrato)
                            </div>
                            <div className="text-xs font-bold flex items-center gap-2">
                              R$ {(selectedProperty.securityDepositAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                selectedProperty.securityDepositPaid 
                                  ? 'bg-emerald-200/80 text-emerald-800' 
                                  : 'bg-amber-200/80 text-amber-900'
                              }`}>
                                {selectedProperty.securityDepositPaid ? 'PAGO' : 'PENDENTE'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {!selectedProperty.securityDepositPaid && (
                          <button
                            type="button"
                            onClick={handleToggleDepositInInvoice}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                              isDepositIncluded
                                ? 'bg-purple-700 text-white shadow-sm hover:bg-purple-800' 
                                : 'bg-white text-purple-700 border border-purple-300 hover:bg-purple-100'
                            }`}
                          >
                            {isDepositIncluded ? (
                              <>
                                <CheckCircle size={14} /> Caução Incluído nesta Fatura
                              </>
                            ) : (
                              <>
                                <Plus size={14} /> Incluir Caução na Fatura
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Tipo de Despesa</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { id: 'water', label: 'Água', icon: Droplets, color: 'blue' },
                      { id: 'electricity', label: 'Luz', icon: Zap, color: 'yellow' },
                      { id: 'rent', label: 'Aluguel', icon: DollarSign, color: 'green' },
                      { id: 'other', label: 'Outro', icon: Plus, color: 'purple' }
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleTypeChange(t.id as any)}
                        className={`py-3 rounded-2xl text-xs font-bold transition-all flex flex-col items-center gap-1 border-2 ${
                          type === t.id 
                            ? `border-${t.color}-500 bg-${t.color}-50 text-${t.color}-600` 
                            : 'border-gray-100 text-gray-400 hover:border-gray-200 hover:text-gray-600'
                        }`}
                      >
                        <t.icon size={18} />
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {type !== 'other' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider flex items-center gap-2">
                        <DollarSign size={14} /> Valor (R$)
                      </label>
                      <div className="relative">
                        <input
                          required
                          type="text"
                          inputMode="decimal"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          readOnly={!!(previousReading && currentReading && (type === 'water' || type === 'electricity'))}
                          placeholder="0,00"
                          className={`w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-gray-900 ${
                            !!(previousReading && currentReading && (type === 'water' || type === 'electricity')) ? 'opacity-60 cursor-not-allowed' : ''
                          }`}
                        />
                        {settings && (type === 'water' || type === 'electricity') && (
                          <button
                            type="button"
                            onClick={() => setShowRateCalculator(!showRateCalculator)}
                            className={`absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold ${
                              customRate && parseValue(customRate) > 0
                                ? 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
                                : 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100'
                            }`}
                            title="Clique para alterar a tarifa do kWh/m³ nesta cobrança"
                          >
                            <Calculator size={15} className={customRate && parseValue(customRate) > 0 ? 'text-amber-700' : 'text-blue-600'} />
                            <span className="text-[10px] font-extrabold uppercase tracking-wider">
                              {customRate && parseValue(customRate) > 0 ? `R$ ${parseValue(customRate).toFixed(2)}` : 'Tarifa'}
                            </span>
                          </button>
                        )}
                      </div>

                      {(showRateCalculator || (customRate && parseValue(customRate) > 0)) && (type === 'water' || type === 'electricity') && (
                        <div className="mt-2.5 p-3.5 bg-gradient-to-r from-blue-50/90 to-amber-50/70 border border-blue-200/80 rounded-2xl space-y-2 shadow-sm">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-extrabold text-gray-800 flex items-center gap-1.5">
                              <Calculator size={14} className="text-blue-600" />
                              Tarifa Individual do {type === 'electricity' ? 'kWh (Luz)' : 'm³ (Água)'} (R$)
                            </label>
                            {customRate && (
                              <button
                                type="button"
                                onClick={() => setCustomRate('')}
                                className="text-[10px] font-bold text-blue-600 hover:text-blue-800 underline cursor-pointer"
                              >
                                Usar Padrão (R$ {defaultRate.toFixed(2)})
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={customRate}
                              onChange={(e) => setCustomRate(e.target.value)}
                              placeholder={`Padrão: R$ ${defaultRate.toFixed(2)} por ${type === 'electricity' ? 'kWh' : 'm³'}`}
                              className="w-full px-3 py-2 bg-white border border-blue-300 rounded-xl text-xs font-bold font-mono text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none shadow-inner"
                            />
                          </div>
                          <p className="text-[10px] text-gray-600 font-medium leading-tight">
                            {customRate && parseValue(customRate) > 0
                              ? `Cálculo ajustado para R$ ${parseValue(customRate).toFixed(2)} / ${type === 'electricity' ? 'kWh' : 'm³'}`
                              : `Tarifa padrão configurada: R$ ${defaultRate.toFixed(2)} / ${type === 'electricity' ? 'kWh' : 'm³'}`}
                          </p>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider flex items-center gap-2">
                        <FileText size={14} /> Observações
                      </label>
                      <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Notas adicionais..."
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                      />
                    </div>

                    {otherItems.some(i => parseValue(i.amount) !== 0 || i.notes) && (
                      <div className="sm:col-span-2 bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                          <span className="flex items-center gap-1.5"><FileText size={14} className="text-slate-500" /> Itens Adicionais (Saldo / Caução / Outros):</span>
                          <button 
                            type="button" 
                            onClick={() => handleTypeChange('other')}
                            className="text-[11px] font-extrabold text-blue-600 hover:text-blue-700 underline cursor-pointer"
                          >
                            Editar na aba "Outro"
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {otherItems.map((item, idx) => {
                            const val = parseValue(item.amount);
                            if (val === 0 && !item.notes) return null;
                            const isBal = isBalanceItem(item);
                            const isDep = isDepositItem(item);
                            return (
                              <div 
                                key={idx}
                                onClick={() => handleTypeChange('other')}
                                className={`px-2.5 py-1 rounded-xl text-xs font-bold border flex items-center gap-2 cursor-pointer transition-all hover:opacity-90 ${
                                  isBal ? 'bg-amber-100/90 text-amber-900 border-amber-300' :
                                  isDep ? 'bg-purple-100/90 text-purple-900 border-purple-300' :
                                  'bg-white text-slate-800 border-slate-200'
                                }`}
                                title="Clique para editar este item na aba Outro"
                              >
                                <span>{item.notes || 'Outro Item'}:</span>
                                <span className="font-mono font-extrabold">R$ {val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {otherItems.map((item, index) => {
                      const numVal = parseValue(item.amount);
                      const isBal = isBalanceItem(item);
                      const isDep = isDepositItem(item);
                      const isCredit = numVal < 0 || (isBal && item.notes?.toLowerCase().includes('crédito'));

                      return (
                        <div key={index} className={`grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl border relative group transition-all ${
                          isCredit ? 'bg-teal-50/80 border-teal-200 shadow-sm' :
                          isBal ? 'bg-amber-50/80 border-amber-200 shadow-sm' :
                          isDep ? 'bg-purple-50/80 border-purple-200 shadow-sm' :
                          'bg-gray-50 border-gray-100'
                        }`}>
                          {isBal && (
                            <div className={`sm:col-span-2 flex items-center justify-between text-[10px] font-extrabold px-3 py-1.5 rounded-xl border ${
                              isCredit ? 'bg-teal-100 text-teal-900 border-teal-300' : 'bg-amber-100 text-amber-900 border-amber-300'
                            }`}>
                              <span className="flex items-center gap-1.5">
                                <AlertCircle size={13} /> {isCredit ? 'SALDO POSITIVO / CRÉDITO ANTERIOR (EDITÁVEL)' : 'SALDO DEVEDOR ANTERIOR (EDITÁVEL)'}
                              </span>
                              <span className="opacity-80">Editável livremente</span>
                            </div>
                          )}

                          {isDep && (
                            <div className="sm:col-span-2 flex items-center justify-between text-[10px] font-extrabold bg-purple-100 text-purple-900 border border-purple-300 px-3 py-1.5 rounded-xl">
                              <span className="flex items-center gap-1.5">
                                <Shield size={13} /> CAUÇÃO / GARANTIA DO CONTRATO (EDITÁVEL)
                              </span>
                              <span className="opacity-80">Editável livremente</span>
                            </div>
                          )}

                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider flex items-center gap-2">
                              <DollarSign size={14} className={isCredit ? 'text-teal-600' : isBal ? 'text-amber-600' : isDep ? 'text-purple-600' : ''} /> Valor (R$)
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={item.amount}
                              onChange={(e) => {
                                const newItems = [...otherItems];
                                newItems[index] = {
                                  ...newItems[index],
                                  amount: e.target.value,
                                  isManuallyEdited: true
                                };
                                setOtherItems(newItems);
                                setDrafts(prev => ({
                                  ...prev,
                                  'other': {
                                    ...(prev['other'] || { amount: '', notes: '', previousReading: '', currentReading: '' }),
                                    otherItems: newItems
                                  }
                                }));
                              }}
                              placeholder="0,00"
                              className={`w-full px-4 py-3 bg-white border rounded-2xl focus:ring-2 outline-none transition-all font-bold ${
                                isCredit ? 'border-teal-300 text-teal-800 focus:ring-teal-500' :
                                isBal ? 'border-amber-300 text-amber-900 focus:ring-amber-500' :
                                isDep ? 'border-purple-300 text-purple-900 focus:ring-purple-500' :
                                'border-gray-200 text-gray-900 focus:ring-blue-500'
                              }`}
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider flex items-center gap-2">
                              <FileText size={14} className={isCredit ? 'text-teal-600' : isBal ? 'text-amber-600' : isDep ? 'text-purple-600' : ''} /> Descrição / Observação
                            </label>
                            <input
                              type="text"
                              value={item.notes}
                              onChange={(e) => {
                                const newItems = [...otherItems];
                                newItems[index] = {
                                  ...newItems[index],
                                  notes: e.target.value,
                                  isManuallyEdited: true
                                };
                                setOtherItems(newItems);
                                setDrafts(prev => ({
                                  ...prev,
                                  'other': {
                                    ...(prev['other'] || { amount: '', notes: '', previousReading: '', currentReading: '' }),
                                    otherItems: newItems
                                  }
                                }));
                              }}
                              placeholder="Ex: Saldo Devedor, Caução, IPTU..."
                              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-medium"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const updated = otherItems.filter((_, i) => i !== index);
                              const newItems = updated.length > 0 ? updated : [{ amount: '', notes: '' }];
                              setOtherItems(newItems);
                              setDrafts(prev => ({
                                ...prev,
                                'other': {
                                  ...(prev['other'] || { amount: '', notes: '', previousReading: '', currentReading: '' }),
                                  otherItems: newItems
                                }
                              }));
                            }}
                            className="absolute -top-2.5 -right-2.5 p-1.5 bg-rose-50 border border-rose-200 text-rose-600 rounded-full shadow-sm hover:bg-rose-100 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center justify-center z-10"
                            title="Remover este item"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })}

                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setOtherItems([...otherItems, { amount: '', notes: '' }])}
                        className="flex-1 py-3 border-2 border-dashed border-gray-200 text-gray-500 rounded-2xl text-xs font-bold uppercase tracking-wider hover:border-blue-300 hover:text-blue-600 transition-all flex items-center justify-center gap-2 bg-gray-50/50"
                      >
                        <Plus size={16} /> Adicionar Outro Item
                      </button>

                      {!otherItems.some(isBalanceItem) && (
                        <button
                          type="button"
                          onClick={() => {
                            const newItem = { amount: '0,00', notes: 'Saldo Devedor Anterior', isManuallyEdited: true };
                            const newItems = (otherItems.length === 1 && !otherItems[0].amount && !otherItems[0].notes)
                              ? [newItem]
                              : [...otherItems, newItem];
                            setOtherItems(newItems);
                            setDrafts(prev => ({
                              ...prev,
                              'other': {
                                ...(prev['other'] || { amount: '', notes: '', previousReading: '', currentReading: '' }),
                                otherItems: newItems
                              }
                            }));
                          }}
                          className="py-3 px-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl text-xs font-bold uppercase tracking-wider hover:bg-amber-100 transition-all flex items-center justify-center gap-1.5"
                        >
                          <Plus size={14} /> Saldo Devedor
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <AnimatePresence mode="wait">
                  {(type === 'water' || type === 'electricity') && (
                    <motion.div
                      key={type}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Leitura Anterior</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={previousReading}
                              onChange={(e) => setPreviousReading(e.target.value)}
                              placeholder="0,00"
                              className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Leitura Atual</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={currentReading}
                              onChange={(e) => setCurrentReading(e.target.value)}
                              placeholder="0,00"
                              className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono text-sm"
                            />
                          </div>
                        </div>
                        
                        {previousReading && currentReading && parseFloat(currentReading.replace(',', '.')) >= parseFloat(previousReading.replace(',', '.')) && (
                          <div className="flex items-center justify-between px-4 py-3 bg-blue-600 rounded-xl text-white">
                            <div className="flex flex-col">
                              <span className="text-[9px] font-bold uppercase tracking-widest opacity-80">Consumo Calculado</span>
                              <span className="text-sm font-black">
                                {(parseFloat(currentReading.replace(',', '.')) - parseFloat(previousReading.replace(',', '.'))).toFixed(2)} {type === 'water' ? 'm³' : 'kWh'}
                              </span>
                            </div>
                            <div className="text-[10px] text-right opacity-90 font-medium italic max-w-[150px] leading-tight">
                              {calculationBreakdown || 'Tarifa aplicada conforme configurações'}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Right Column: Logistics, Status & Summary */}
            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em]">Logística e Status</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider flex items-center gap-2">
                      <Calendar size={14} /> Data Leitura
                    </label>
                    <input
                      required
                      type="date"
                      value={readingDate}
                      onChange={(e) => {
                        setReadingDate(e.target.value);
                        setIsReadingDateManual(true);
                      }}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider flex items-center gap-2">
                      <Calendar size={14} /> Vencimento
                    </label>
                    <input
                      required
                      type="date"
                      value={dueDate}
                      onChange={(e) => {
                        setDueDate(e.target.value);
                        setIsDueDateManual(true);
                      }}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <DollarSign size={14} /> Valor Pago Total (R$)
                      </span>
                      {paymentHistory.length > 0 && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                          {paymentHistory.length} lançamento(s)
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={paidAmount}
                        onChange={(e) => setPaidAmount(e.target.value)}
                        placeholder="0,00"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-gray-900"
                      />
                    </div>
                    {parseValue(paidAmount) > currentTotal && currentTotal > 0 && (
                      <div className="mt-2 p-2.5 bg-teal-50 border border-teal-200 text-teal-800 rounded-xl text-xs font-bold flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle size={14} className="text-teal-600 shrink-0" />
                          <span>Saldo Positivo: <strong>R$ {(parseValue(paidAmount) - currentTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                        </span>
                        <span className="text-[10px] bg-teal-100 text-teal-900 px-2 py-0.5 rounded-md">Lança p/ próx. fatura</span>
                      </div>
                    )}
                  </div>

                  {/* Toggle Button for Partial Payments */}
                  <button
                    type="button"
                    onClick={() => setShowPartialHistory(!showPartialHistory)}
                    className="w-full py-2 px-3 bg-teal-50 hover:bg-teal-100/80 text-teal-800 rounded-xl font-bold text-xs flex items-center justify-between transition-colors border border-teal-200/60 cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <CreditCard size={14} className="text-teal-600" />
                      <span>Lançar / Ver Pagamentos Parciais</span>
                    </span>
                    {showPartialHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  {/* Partial Payment Management Collapsible Box */}
                  <AnimatePresence>
                    {showPartialHistory && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="p-3.5 sm:p-4 bg-teal-50/70 rounded-2xl border border-teal-200/80 space-y-3.5 text-xs shadow-xs">
                          <div className="flex items-center justify-between border-b border-teal-200/60 pb-2 flex-wrap gap-1">
                            <h4 className="font-bold text-teal-900 uppercase tracking-wider text-[11px] sm:text-xs flex items-center gap-1.5">
                              <Plus size={14} className="text-teal-700" /> Lançar Pagamento Parcial
                            </h4>
                            {paymentHistory.length > 0 && (
                              <span className="text-[11px] font-extrabold text-teal-900 bg-teal-100/90 px-2.5 py-0.5 rounded-full border border-teal-300/60">
                                Total: R$ {paymentHistory.reduce((s, p) => s + (p.amount || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">Data do Pagamento *</label>
                              <input
                                type="date"
                                value={partialPayDate}
                                onChange={(e) => setPartialPayDate(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-teal-500 outline-none shadow-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">Valor do Pagamento (R$) *</label>
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="0,00"
                                value={partialPayAmount}
                                onChange={(e) => setPartialPayAmount(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none shadow-xs"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">Forma / Observação</label>
                            <input
                              type="text"
                              placeholder="Ex: PIX, Dinheiro, Parcela 1..."
                              value={partialPayNotes}
                              onChange={(e) => setPartialPayNotes(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-medium text-slate-800 focus:ring-2 focus:ring-teal-500 outline-none shadow-xs"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={handleAddPartialPayment}
                            className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 active:scale-[0.99] text-white rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <Plus size={16} /> Confirmar Lançamento
                          </button>

                          {/* List of Partial Payments */}
                          {paymentHistory.length > 0 && (
                            <div className="pt-3 border-t border-teal-200/80 space-y-2">
                              <span className="text-[11px] font-bold text-teal-900 uppercase tracking-wider block">
                                Histórico de Lançamentos ({paymentHistory.length}):
                              </span>
                              <div className="max-h-60 sm:max-h-72 overflow-y-auto space-y-2 pr-1">
                                {paymentHistory.map((p) => {
                                  const isEditing = editingPartialId === p.id;
                                  let dateStr = p.date;
                                  if (p.date && p.date.includes('-')) {
                                    const parts = p.date.split('-');
                                    if (parts.length === 3) dateStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
                                  }

                                  if (isEditing) {
                                    return (
                                      <div key={p.id} className="p-3 bg-white rounded-xl border-2 border-teal-500 space-y-2.5 shadow-xs">
                                        <div className="text-[11px] font-bold text-teal-800 uppercase">Editando Lançamento</div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                          <div>
                                            <label className="block text-[10px] font-bold text-slate-600 mb-1">Data</label>
                                            <input
                                              type="date"
                                              value={editingPartialDate}
                                              onChange={(e) => setEditingPartialDate(e.target.value)}
                                              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-teal-500 outline-none"
                                            />
                                          </div>
                                          <div>
                                            <label className="block text-[10px] font-bold text-slate-600 mb-1">Valor (R$)</label>
                                            <input
                                              type="text"
                                              inputMode="decimal"
                                              value={editingPartialAmount}
                                              onChange={(e) => setEditingPartialAmount(e.target.value)}
                                              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-teal-500 outline-none"
                                            />
                                          </div>
                                        </div>
                                        <div>
                                          <label className="block text-[10px] font-bold text-slate-600 mb-1">Observação</label>
                                          <input
                                            type="text"
                                            value={editingPartialNotes}
                                            onChange={(e) => setEditingPartialNotes(e.target.value)}
                                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:ring-2 focus:ring-teal-500 outline-none"
                                          />
                                        </div>
                                        <div className="flex items-center justify-end gap-2 pt-1">
                                          <button
                                            type="button"
                                            onClick={handleCancelEditPartial}
                                            className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                                          >
                                            <X size={14} /> Cancelar
                                          </button>
                                          <button
                                            type="button"
                                            onClick={handleSaveEditPartial}
                                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                                          >
                                            <Check size={14} /> Salvar Alteração
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  }

                                  return (
                                    <div key={p.id} className="p-3 bg-white rounded-xl border border-teal-200/80 hover:border-teal-400 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
                                      <div className="space-y-0.5">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="font-black text-slate-900 text-sm">
                                            R$ {p.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </span>
                                          <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100">
                                            {dateStr}
                                          </span>
                                        </div>
                                        {p.notes && (
                                          <p className="text-xs text-slate-600 font-medium">
                                            {p.notes}
                                          </p>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 self-end sm:self-center pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100 w-full sm:w-auto justify-end">
                                        <button
                                          type="button"
                                          onClick={() => handleStartEditPartial(p)}
                                          className="px-2 py-1 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer text-xs font-medium flex items-center gap-1"
                                          title="Editar Lançamento"
                                        >
                                          <Edit2 size={13} /> Editar
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleRemovePartialPayment(p.id)}
                                          className="px-2 py-1 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer text-xs font-medium flex items-center gap-1"
                                          title="Remover Lançamento"
                                        >
                                          <Trash2 size={13} /> Excluir
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                {(() => {
                  const currentDrafts = {
                    ...drafts,
                    [type]: {
                      amount,
                      notes,
                      previousReading,
                      currentReading,
                      otherItems: type === 'other' ? otherItems : drafts[type]?.otherItems
                    }
                  };
                  
                  const items: { type: string, amount: number, notes?: string }[] = [];
                  (Object.entries(currentDrafts) as [string, BillingDraft][]).forEach(([t, d]) => {
                    if (t === 'other' && d.otherItems) {
                      d.otherItems.forEach(item => {
                        const val = parseValue(item.amount);
                        if (!isNaN(val) && val !== 0) items.push({ type: 'other', amount: val, notes: item.notes });
                      });
                    } else {
                      const val = parseValue(d.amount);
                      if (!isNaN(val) && val !== 0) items.push({ type: t, amount: val });
                    }
                  });

                  if (items.length === 0) return null;

                  const total = Math.round((items.reduce((acc, item) => acc + item.amount, 0) + Number.EPSILON) * 100) / 100;
                  const paid = parseValue(paidAmount);
                  const balance = Math.round((total - paid + Number.EPSILON) * 100) / 100;

                  return (
                    <div className="bg-gray-50/50 border border-gray-100 p-5 rounded-3xl space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em]">Resumo de Valores</h3>
                        <div className="h-px flex-1 bg-gray-100 ml-4"></div>
                      </div>
                      
                      <div className="space-y-2">
                        {items.map((item, idx) => {
                          const isCredit = item.amount < 0;
                          const absVal = Math.abs(item.amount);
                          return (
                            <div key={idx} className="flex items-center justify-between">
                              <div className="flex flex-col">
                                <span className={`text-[10px] font-bold uppercase tracking-wider truncate mr-2 ${isCredit ? 'text-teal-700 font-extrabold' : 'text-gray-500'}`}>
                                  {item.notes ? item.notes : (item.type === 'water' ? 'Água' : item.type === 'electricity' ? 'Luz' : item.type === 'rent' ? 'Aluguel' : 'Outro')}
                                </span>
                                {item.notes && item.type !== 'other' && <span className="text-[8px] text-gray-400 italic">{item.notes}</span>}
                              </div>
                              <span className={`text-[11px] font-black ${isCredit ? 'text-teal-600' : 'text-gray-900'}`}>
                                {isCredit ? `- R$ ${absVal.toFixed(2)}` : `R$ ${item.amount.toFixed(2)}`}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      <div className="pt-3 border-t border-dashed border-gray-200 space-y-2">
                        <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          <span>Total da Cobrança</span>
                          <span className="font-extrabold text-gray-900">R$ {total.toFixed(2)}</span>
                        </div>
                        
                        {paid > 0 && (
                          <div className="flex justify-between items-center text-[10px] font-black text-green-600 uppercase tracking-widest">
                            <span>Valor Pago</span>
                            <span>- R$ {paid.toFixed(2)}</span>
                          </div>
                        )}

                        <div className={`flex justify-between items-center p-2.5 rounded-xl ${balance < -0.01 ? 'bg-teal-600 text-white' : balance <= 0.01 ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'}`}>
                          <span className="text-[9px] font-black uppercase tracking-[0.1em]">
                            {balance < -0.01 ? 'Quitado (Crédito Positivo)' : balance <= 0.01 ? 'Quitado' : 'Saldo Devedor'}
                          </span>
                          <span className="text-lg font-black">
                            {balance < -0.01 ? `+ R$ ${Math.abs(balance).toFixed(2)}` : `R$ ${Math.max(0, balance).toFixed(2)}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border-2 border-gray-100 text-gray-400 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-gray-50 transition-all"
            >
              Cancelar
            </button>
            <button
              disabled={loading}
              type="submit"
              className="flex-[2] bg-blue-600 text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save size={18} />
              {loading ? 'Processando...' : billing ? 'Salvar Alterações' : 'Confirmar Cobrança'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
