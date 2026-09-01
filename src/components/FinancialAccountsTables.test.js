import { useState } from 'react';
import { render, fireEvent } from '@testing-library/react';
import FinancialAccountsTables from './FinancialAccountsTables';
import { applyPensionValueEditPayload } from '../utils/portfolioMath';

// Mirrors how App.js actually wires editingField/handleInlineEdit for
// pension funds (see handleInlineEdit's 'currentValue' case in App.js),
// so this test exercises the real end-to-end contract, not just the
// component's isolated rendering.
function Harness({ initialFund }) {
  const [pensionFunds, setPensionFunds] = useState([initialFund]);
  const [editingField, setEditingField] = useState(null);

  const handleCellClick = (id, field) => setEditingField(`${id}-${field}`);
  const finishInlineEdit = () => setEditingField(null);
  const handleInlineEdit = (id, field, value) => {
    setPensionFunds((funds) => funds.map((f) => {
      if (f.id !== id) return f;
      if (field === 'currentValue') return applyPensionValueEditPayload(f, value);
      return { ...f, [field]: value };
    }));
  };

  return (
    <FinancialAccountsTables
      pensionFunds={pensionFunds}
      cashFunds={[]}
      bankBalances={[]}
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
// 2=currentValue, 3=currentValueDate, 4=previousValue, 5=previousValueDate
// (showAdditionalData is true in these tests).
function pensionRowCells(container) {
  const row = container.querySelector('tbody tr');
  return {
    currentValue: row.children[2],
    currentValueDate: row.children[3],
    previousValue: row.children[4],
    previousValueDate: row.children[5]
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
