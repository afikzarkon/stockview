import { useState } from 'react';
import { render, fireEvent } from '@testing-library/react';
import FinancialAccountsTables from './FinancialAccountsTables';
import { applyLedgerValueEditPayload } from '../utils/portfolioMath';

// Mirrors how App.js actually wires editingField/handleInlineEdit for
// ledger items - pension funds, cash funds, and bank balances all route a
// 'currentValue' edit through applyLedgerValueEditPayload (see
// handleInlineEdit in App.js) - so this test exercises the real
// end-to-end contract, not just the component's isolated rendering.
function Harness({ initialFund, initialCashFunds = [], initialBankBalances = [] }) {
  const [pensionFunds, setPensionFunds] = useState(initialFund ? [initialFund] : []);
  const [cashFunds, setCashFunds] = useState(initialCashFunds);
  const [bankBalances, setBankBalances] = useState(initialBankBalances);
  const [editingField, setEditingField] = useState(null);

  const handleCellClick = (id, field) => setEditingField(`${id}-${field}`);
  const finishInlineEdit = () => setEditingField(null);
  const makeHandleInlineEdit = (setItems) => (id, field, value) => {
    setItems((items) => items.map((it) => {
      if (it.id !== id) return it;
      if (field === 'currentValue') return applyLedgerValueEditPayload(it, value);
      return { ...it, [field]: value };
    }));
  };
  const handleInlineEdit = (id, field, value, exchange) => {
    if (exchange === 'cash_fund') return makeHandleInlineEdit(setCashFunds)(id, field, value);
    if (exchange === 'bank') return makeHandleInlineEdit(setBankBalances)(id, field, value);
    return makeHandleInlineEdit(setPensionFunds)(id, field, value);
  };

  return (
    <FinancialAccountsTables
      pensionFunds={pensionFunds}
      cashFunds={cashFunds}
      bankBalances={bankBalances}
      cpi={null}
      showAdditionalData={true}
      isEditMode={true}
      editingField={editingField}
      handleCellClick={handleCellClick}
      handleInlineEdit={handleInlineEdit}
      finishInlineEdit={finishInlineEdit}
      handleKeyDown={() => {}}
      formatDate={(d) => d}
      formatPriceWithSign={(v) => String(v)}
      handleDelete={() => {}}
    />
  );
}

// Column order in the pension table: 0=fundName, 1=initialInvestment,
// 2=currentValue, 3=currentValueDate, 4=previousValue, 5=previousValueDate,
// 6=todaysIndex, 7=depositIndex (showAdditionalData is true in these tests).
function pensionRowCells(container) {
  const row = container.querySelector('tbody tr');
  return {
    currentValue: row.children[2],
    currentValueDate: row.children[3],
    previousValue: row.children[4],
    previousValueDate: row.children[5],
    todaysIndex: row.children[6],
    depositIndex: row.children[7]
  };
}

describe('FinancialAccountsTables - pension "שווי נוכחי" edit', () => {
  test('editing the value asks for the date in the same action, and both commit together (not today)', () => {
    const fund = { id: 1, fundName: 'קופה לבדיקה', currentValue: 100000, currentValueDate: '2024-03-31', deposits: [] };
    const { container } = render(<Harness initialFund={fund} />);
    const cells = pensionRowCells(container);

    fireEvent.click(cells.currentValue);

    const numberInput = cells.currentValue.querySelector('input[type="number"]');
    const dateInput = cells.currentValue.querySelector('input[type="date"]');
    expect(numberInput).not.toBeNull();
    expect(dateInput).not.toBeNull();
    // the date field starts pre-filled with the fund's existing date, not today
    expect(dateInput.value).toBe('2024-03-31');

    fireEvent.change(numberInput, { target: { value: '111000' } });
    fireEvent.change(dateInput, { target: { value: '2024-06-30' } });
    fireEvent.keyDown(dateInput, { key: 'Enter' });

    // editing closed after the single commit
    expect(cells.currentValue.querySelector('input[type="number"]')).toBeNull();

    // the new value and the user-entered date landed together
    expect(cells.currentValue.textContent).toBe('111000 ₪');
    expect(cells.currentValueDate.textContent).toBe('2024-06-30');
    // the old value/date rolled into "previous", not overwritten
    expect(cells.previousValue.textContent).toBe('100000 ₪');
    expect(cells.previousValueDate.textContent).toBe('2024-03-31');
  });

  test('defaults the date field to today for a fund with no prior currentValueDate', () => {
    const fund = { id: 2, fundName: 'קופה חדשה', currentValue: 5000, currentValueDate: '', deposits: [] };
    const { container } = render(<Harness initialFund={fund} />);
    const cells = pensionRowCells(container);

    fireEvent.click(cells.currentValue);

    const dateInput = cells.currentValue.querySelector('input[type="date"]');
    const today = new Date().toISOString().slice(0, 10);
    expect(dateInput.value).toBe(today);
  });

  test('blurring the edit group without pressing Enter also commits the change', () => {
    const fund = { id: 3, fundName: 'קופה', currentValue: 200000, currentValueDate: '2024-01-01', deposits: [] };
    const { container } = render(<Harness initialFund={fund} />);
    const cells = pensionRowCells(container);

    fireEvent.click(cells.currentValue);
    const numberInput = cells.currentValue.querySelector('input[type="number"]');
    const dateInput = cells.currentValue.querySelector('input[type="date"]');
    fireEvent.change(numberInput, { target: { value: '210000' } });
    fireEvent.change(dateInput, { target: { value: '2024-05-01' } });

    fireEvent.blur(cells.currentValue.querySelector('.pension-value-edit-group'));

    expect(cells.currentValue.querySelector('input[type="number"]')).toBeNull();
    expect(cells.currentValue.textContent).toBe('210000 ₪');
    expect(cells.currentValueDate.textContent).toBe('2024-05-01');
  });
});

describe('FinancialAccountsTables - pension previousValue/previousValueDate are read-only', () => {
  // Regression test for the exact bug this closes: previousValue/
  // previousValueDate used to be independently click-to-edit, bypassing
  // applyPensionValueUpdate's history-preserving flow entirely. They must
  // now only ever change as a side effect of editing "שווי נוכחי" (covered
  // by the describe block above) - clicking them directly must do nothing.
  test('clicking the previousValue cell does not open an editable input', () => {
    const fund = {
      id: 4,
      fundName: 'קופה',
      currentValue: 111000,
      currentValueDate: '2024-06-30',
      previousValue: 100000,
      previousValueDate: '2024-03-31',
      deposits: []
    };
    const { container } = render(<Harness initialFund={fund} />);
    const cells = pensionRowCells(container);

    fireEvent.click(cells.previousValue);
    expect(cells.previousValue.querySelector('input')).toBeNull();
    expect(cells.previousValue.textContent).toBe('100000 ₪');

    fireEvent.click(cells.previousValueDate);
    expect(cells.previousValueDate.querySelector('input')).toBeNull();
    expect(cells.previousValueDate.textContent).toBe('2024-03-31');
  });
});

describe('FinancialAccountsTables - pension CPI columns', () => {
  test("shows today's known CPI index once per fund, and each deposit's own month index in its expanded row", () => {
    const fund = {
      id: 5,
      fundName: 'קופה עם הפקדות',
      currentValue: 111000,
      currentValueDate: '2024-06-30',
      previousValue: 100000,
      previousValueDate: '2024-01-01',
      deposits: [{ date: '2024-02-15', amount: 10000 }]
    };
    const cpi = { currentIndex: 105.3, indexByMonth: { '2024-02': 104.1 } };
    const { container, getByText } = render(
      <FinancialAccountsTables
        pensionFunds={[fund]}
        cashFunds={[]}
        bankBalances={[]}
        cpi={cpi}
        showAdditionalData={true}
        isEditMode={false}
        editingField={null}
        handleCellClick={() => {}}
        handleInlineEdit={() => {}}
        finishInlineEdit={() => {}}
        handleKeyDown={() => {}}
        formatDate={(d) => d}
        formatPriceWithSign={(v) => String(v)}
        handleDelete={() => {}}
      />
    );
    const cells = pensionRowCells(container);
    expect(cells.todaysIndex.textContent).toBe('105.3');
    // the summary row doesn't show a single deposit-month index (a fund
    // can have deposits from several different months)
    expect(cells.depositIndex.textContent).toBe('-');

    // expand the fund to reveal its one deposit row
    fireEvent.click(container.querySelector('.expand-button'));
    expect(getByText('104.1')).toBeInTheDocument();
  });
});

describe('FinancialAccountsTables - cash fund ledger (deposits + withdrawals)', () => {
  test('editing "שווי נוכחי" rolls the old value/date into previous, exactly like a pension fund', () => {
    const fund = {
      id: 10,
      fundName: 'כספית שקלית',
      securityId: '5119609',
      currentValue: 5000,
      currentValueDate: '2024-01-01',
      deposits: [{ date: '2024-01-01', amount: 5000 }]
    };
    const { container } = render(<Harness initialCashFunds={[fund]} />);
    const row = container.querySelector('tbody tr');
    const currentValueCell = row.children[2];

    fireEvent.click(currentValueCell);
    const numberInput = currentValueCell.querySelector('input[type="number"]');
    const dateInput = currentValueCell.querySelector('input[type="date"]');
    fireEvent.change(numberInput, { target: { value: '5200' } });
    fireEvent.change(dateInput, { target: { value: '2024-02-01' } });
    fireEvent.keyDown(dateInput, { key: 'Enter' });

    expect(currentValueCell.textContent).toBe('5200 ₪');
    expect(row.children[3].textContent).toBe('2024-02-01'); // currentValueDate
    expect(row.children[4].textContent).toBe('5000 ₪'); // rolled into previousValue
  });

  test('a withdrawal (negative deposit amount) shows in the expanded ledger labeled "(משיכה)"', () => {
    const fund = {
      id: 11,
      fundName: 'כספית שקלית',
      securityId: '5119609',
      currentValue: 2000,
      currentValueDate: '2024-02-01',
      deposits: [
        { date: '2024-01-01', amount: 5000 },
        { date: '2024-01-20', amount: -3000 }
      ]
    };
    const { container, getByText } = render(<Harness initialCashFunds={[fund]} />);
    fireEvent.click(container.querySelector('.expand-button'));

    expect(getByText('5000 ₪')).toBeInTheDocument();
    expect(getByText((content) => content.includes('-3000') && content.includes('משיכה'))).toBeInTheDocument();
  });

  test('renders a legacy cash fund with no currentValue/deposits fields at all without crashing', () => {
    const legacyFund = { id: 12, fundName: 'כספית ישנה', securityId: '123', amount: 800, updateDate: '2023-01-01' };
    const { container } = render(<Harness initialCashFunds={[legacyFund]} />);
    const row = container.querySelector('tbody tr');
    expect(row.children[2].textContent).toBe('800 ₪'); // falls back to `amount`
    expect(row.children[4].textContent).toBe('0 ₪'); // no previousValue yet
  });
});

describe('FinancialAccountsTables - checking account (עו"ש) ledger', () => {
  test('editing "שווי נוכחי" rolls the old value/date into previous', () => {
    const account = {
      id: 20,
      currentValue: 10000,
      currentValueDate: '2024-01-01',
      deposits: [{ date: '2024-01-01', amount: 10000 }]
    };
    const { container } = render(<Harness initialBankBalances={[account]} />);
    const row = container.querySelector('tbody tr');
    const currentValueCell = row.children[0];

    fireEvent.click(currentValueCell);
    const numberInput = currentValueCell.querySelector('input[type="number"]');
    const dateInput = currentValueCell.querySelector('input[type="date"]');
    fireEvent.change(numberInput, { target: { value: '7000' } });
    fireEvent.change(dateInput, { target: { value: '2024-01-31' } });
    fireEvent.keyDown(dateInput, { key: 'Enter' });

    expect(currentValueCell.textContent).toContain('7000 ₪');
    expect(row.children[1].textContent).toBe('2024-01-31');
    expect(row.children[2].textContent).toBe('10000 ₪'); // rolled into previousValue
  });

  test('a withdrawal shows in the expanded ledger labeled "(משיכה)"', () => {
    const account = {
      id: 21,
      currentValue: 7000,
      currentValueDate: '2024-01-31',
      deposits: [
        { date: '2024-01-01', amount: 10000 },
        { date: '2024-01-15', amount: -3000 }
      ]
    };
    const { container, getByText } = render(<Harness initialBankBalances={[account]} />);
    fireEvent.click(container.querySelector('.expand-button'));
    expect(getByText((content) => content.includes('-3000') && content.includes('משיכה'))).toBeInTheDocument();
  });

  test('renders a legacy bank balance with no currentValue/deposits fields at all without crashing', () => {
    const legacyAccount = { id: 22, amount: 2000, updateDate: '2023-01-01' };
    const { container } = render(<Harness initialBankBalances={[legacyAccount]} />);
    const row = container.querySelector('tbody tr');
    expect(row.children[0].textContent).toContain('2000 ₪');
  });
});
