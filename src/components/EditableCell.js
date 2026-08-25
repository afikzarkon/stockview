import React from 'react';

// A single click-to-edit table cell used in both stock tables.
// Renders the display value normally; when this exact field is being
// edited (editingField === `${id}-${field}`), it swaps to an <input>.
//
// This is the same pattern that used to be copy-pasted ~20 times across
// IsraeliStocksTable.js and AmericanStocksTable.js — behavior is unchanged,
// only the location moved.
function EditableCell({
  id,
  field,
  exchange,
  value,
  editingField,
  isEditMode,
  handleCellClick,
  handleInlineEdit,
  finishInlineEdit,
  handleKeyDown,
  displayValue,
  type = 'text',
  step,
  min,
  parse,
  style,
  className
}) {
  const isEditing = editingField === `${id}-${field}`;
  const cellClassName = [isEditMode ? 'editable-cell' : '', className].filter(Boolean).join(' ');
  const handleChange = (e) => {
    const raw = e.target.value;
    const parsed = parse ? parse(raw) : raw;
    handleInlineEdit(id, field, parsed, exchange);
  };

  return (
    <td
      onClick={() => handleCellClick(id, field, exchange)}
      className={cellClassName}
      style={style}
    >
      {isEditing ? (
        <input
          type={type}
          value={value}
          onChange={handleChange}
          onBlur={finishInlineEdit}
          onKeyDown={(e) => handleKeyDown(e, id, field, exchange)}
          autoFocus
          step={step}
          min={min}
        />
      ) : (
        displayValue
      )}
    </td>
  );
}

export default EditableCell;
