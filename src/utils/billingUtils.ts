import { getDocs, getDoc, updateDoc, serverTimestamp } from '../lib/db';
import { parseDate } from './firestore';
import { BillingRecord, Property, BillingItem } from '../types';
import { isBefore } from 'date-fns';

export const isBalanceItem = (item: { notes?: string; type?: string; isManuallyEdited?: boolean }) => {
  if (!item) return false;
  if (isDepositItem(item)) return false;
  if (!item.notes) return false;
  const n = item.notes.trim().toLowerCase();
  return (
    n.startsWith('saldo devedor') ||
    n.startsWith('saldo positivo') ||
    n.includes('saldo anterior') ||
    n.includes('crédito anterior') ||
    n.includes('credito anterior') ||
    (n.includes('saldo') && !n.includes('caução') && !n.includes('caucao') && !n.includes('garantia'))
  );
};

export const isDepositItem = (item: { type?: string; notes?: string }) => {
  if (!item) return false;
  const n = (item.notes || '').trim().toLowerCase();
  return n.includes('caução') || n.includes('caucao') || n.includes('deposit') || n.includes('garantia');
};

function billingTime(b: BillingRecord): number {
  const due = parseDate(b.dueDate);
  if (due) return due.getTime();
  const created = parseDate(b.createdAt);
  return created ? created.getTime() : 0;
}

export async function getPreviousUnpaidBalance(propertyId: string, beforeDueDate?: Date): Promise<number> {
  if (!propertyId) return 0;

  try {
    let pData: Property | undefined;
    const propertyDoc = await getDoc('properties', propertyId);
    if (propertyDoc) {
      pData = propertyDoc as Property;
    }
    
    const leaseStart = parseDate(pData?.leaseStartDate);
    const currentTenantName = pData?.ownerName || '';

    const querySnapshot = await getDocs('billings', {
      filters: [{ field: 'propertyId', op: 'eq', value: propertyId }],
    });
    
    const priorBillings = querySnapshot
      .map(d => d as BillingRecord)
      .filter(b => {
        // Only consider billings for the CURRENT active tenant
        if (currentTenantName && b.tenantName && b.tenantName.trim().toLowerCase() !== currentTenantName.trim().toLowerCase()) {
          return false;
        }

        // If we have a lease start date, only consider billings from this contract period
        if (leaseStart && b.dueDate) {
          const bDueDate = parseDate(b.dueDate);
          if (bDueDate && isBefore(bDueDate, leaseStart)) return false;
        }

        // Filter by beforeDueDate if provided
        if (beforeDueDate && b.dueDate) {
          const bDueDate = parseDate(b.dueDate);
          if (!bDueDate || !isBefore(bDueDate, beforeDueDate)) return false;
        }

        return true;
      })
      .sort((a, b) => billingTime(a) - billingTime(b));

    let currentBalance = 0;

    for (const b of priorBillings) {
      const baseItems = (b.items || []).filter(item => !isBalanceItem(item));
      const baseSum = baseItems.reduce((sum, item) => sum + (item.amount || 0), 0);
      
      let balanceItemVal = 0;
      const manualBalItem = (b.items || []).find(item => isBalanceItem(item) && item.isManuallyEdited);

      if (b.userRemovedBalanceItem) {
        if (manualBalItem) {
          balanceItemVal = manualBalItem.amount || 0;
        }
      } else {
        if (manualBalItem) {
          balanceItemVal = manualBalItem.amount || 0;
        } else if (Math.abs(currentBalance) > 0.01) {
          balanceItemVal = currentBalance;
        }
      }

      const totalB = Math.round((baseSum + balanceItemVal + Number.EPSILON) * 100) / 100;
      const paidB = b.paidAmount || 0;
      
      currentBalance = Math.round((totalB - paidB + Number.EPSILON) * 100) / 100;
    }

    return currentBalance;
  } catch (error) {
    console.error('Error calculating previous unpaid balance:', error);
    return 0;
  }
}

export async function syncSubsequentBillingsBalances(propertyId: string) {
  if (!propertyId) return;

  try {
    let pData: Property | undefined;
    const propertyDoc = await getDoc('properties', propertyId);
    if (propertyDoc) {
      pData = propertyDoc as Property;
    }
    
    const leaseStart = parseDate(pData?.leaseStartDate);
    const currentTenantName = pData?.ownerName || '';

    const querySnapshot = await getDocs('billings', {
      filters: [{ field: 'propertyId', op: 'eq', value: propertyId }],
    });
    
    const allBillings = querySnapshot
      .map(d => d as BillingRecord)
      .filter(b => {
        if (currentTenantName && b.tenantName && b.tenantName.trim().toLowerCase() !== currentTenantName.trim().toLowerCase()) {
          return false;
        }
        if (leaseStart && b.dueDate) {
          const bDueDate = parseDate(b.dueDate);
          if (bDueDate && isBefore(bDueDate, leaseStart)) return false;
        }
        return true;
      })
      .sort((a, b) => billingTime(a) - billingTime(b));

    // Check security deposit paid status
    let hasPaidDeposit = false;
    allBillings.forEach(b => {
      const hasDeposit = b.items?.some(isDepositItem);
      if (hasDeposit && (b.status === 'paid' || (b.paidAmount && b.paidAmount >= b.totalAmount))) {
        hasPaidDeposit = true;
      }
    });

    if (hasPaidDeposit && pData && !pData.securityDepositPaid) {
      await updateDoc('properties', propertyId, { securityDepositPaid: true });
    }

    let carryoverBalance = 0;

    for (let i = 0; i < allBillings.length; i++) {
      const currentBilling = allBillings[i];
      const isVirtual = !currentBilling.id || currentBilling.id.startsWith('virtual_');

      const currentItems = currentBilling.items || [];
      const baseItems = currentItems.filter(item => !isBalanceItem(item));
      const manualBal = currentItems.find(item => isBalanceItem(item) && item.isManuallyEdited);

      let updatedItems: BillingItem[] = [...baseItems];
      let effectiveBal = 0;

      if (currentBilling.userRemovedBalanceItem) {
        if (manualBal) {
          updatedItems.push(manualBal);
          effectiveBal = manualBal.amount || 0;
        }
      } else {
        if (manualBal) {
          updatedItems.push(manualBal);
          effectiveBal = manualBal.amount || 0;
        } else if (Math.abs(carryoverBalance) > 0.01) {
          const newBalItem: BillingItem = {
            type: 'other',
            amount: carryoverBalance,
            notes: carryoverBalance > 0 ? 'Saldo Devedor Anterior Acumulado' : 'Saldo Positivo Anterior (Crédito)'
          };
          updatedItems.push(newBalItem);
          effectiveBal = carryoverBalance;
        }
      }

      const baseSum = baseItems.reduce((sum, item) => sum + (item.amount || 0), 0);
      const newTotalAmount = Math.round((baseSum + effectiveBal + Number.EPSILON) * 100) / 100;

      if (!isVirtual && currentBilling.status !== 'paid') {
        const itemsChanged = JSON.stringify(currentItems) !== JSON.stringify(updatedItems) || currentBilling.totalAmount !== newTotalAmount;
        if (itemsChanged) {
          await updateDoc('billings', currentBilling.id, {
            items: updatedItems,
            totalAmount: newTotalAmount,
            updatedAt: serverTimestamp()
          });
          currentBilling.items = updatedItems;
          currentBilling.totalAmount = newTotalAmount;
        }
      }

      const paidAmt = currentBilling.paidAmount || 0;
      carryoverBalance = Math.round((newTotalAmount - paidAmt + Number.EPSILON) * 100) / 100;
    }
  } catch (error) {
    console.error('Error syncing subsequent billings balances:', error);
  }
}
