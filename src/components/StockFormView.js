import React from 'react';

function StockFormView({
  isEditMode,
  formData,
  handleSubmit,
  handleInputChange,
  handleBackToHome,
  handleSaveEdit,
  handleCancelEdit
}) {
  return (
    <div className="App">
      <div className="form-container">
        <div className="form-content">
          <h1 className="form-title">{isEditMode ? 'עריכת מנייה' : 'הוספת מידע על מנייה'}</h1>

          <form onSubmit={handleSubmit} className="stock-form">
            <div className="form-group">
              <label htmlFor="itemType">מה להוסיף</label>
              <select
                id="itemType"
                name="itemType"
                value={formData.itemType}
                onChange={handleInputChange}
              >
                <option value="stock">מנייה</option>
                <option value="pension">קופת גמל</option>
                <option value="bank">עו"ש</option>
                <option value="cash_fund">כספית שקלית</option>
              </select>
            </div>
            {formData.itemType === 'stock' && (
              <div className="form-group">
                <label htmlFor="stockName">
                  {formData.exchange === 'israeli' ? 'ID מנייה מ-TASE *' : 'שם מנייה *'}
                </label>
                <input
                  type="text"
                  id="stockName"
                  name="stockName"
                  value={formData.stockName}
                  onChange={handleInputChange}
                  required
                  placeholder={formData.exchange === 'israeli' ? 'לדוגמה: 1159243 (ID של המנייה מ-TASE)' : 'לדוגמה: AAPL, MSFT, TSLA'}
                />
                {formData.exchange === 'israeli' && (
                  <small className="form-help">
                    עבור מניות ישראליות, הזן את ה-ID של המנייה מ-TASE (מספר כמו 1159243)
                  </small>
                )}
              </div>
            )}

            {formData.itemType === 'pension' && (
              <div className="form-group">
                <label htmlFor="stockName">שם קופה *</label>
                <input
                  type="text"
                  id="stockName"
                  name="stockName"
                  value={formData.stockName}
                  onChange={handleInputChange}
                  required
                  placeholder="לדוגמה: קופת גמל להשקעה X"
                />
              </div>
            )}

            {formData.itemType === 'cash_fund' && (
              <div className="form-group">
                <label htmlFor="securityId">מספר נייר ערך *</label>
                <input
                  type="text"
                  id="securityId"
                  name="securityId"
                  value={formData.securityId}
                  onChange={handleInputChange}
                  required
                  placeholder="לדוגמה: 5119609"
                />
              </div>
            )}

            {(formData.itemType === 'stock' || formData.itemType === 'pension' || formData.itemType === 'bank' || formData.itemType === 'cash_fund') && (
              <div className="form-group">
                <label htmlFor="purchaseDate">{formData.itemType === 'stock' ? 'תאריך קנייה *' : 'תאריך עדכון *'}</label>
                <input
                  type="date"
                  id="purchaseDate"
                  name="purchaseDate"
                  value={formData.purchaseDate}
                  onChange={handleInputChange}
                  required
                />
              </div>
            )}

            {formData.itemType === 'stock' ? (
              <div className="form-group">
                <label htmlFor="purchasePrice">מחיר קנייה *</label>
                <input
                  type="number"
                  id="purchasePrice"
                  name="purchasePrice"
                  value={formData.purchasePrice}
                  onChange={handleInputChange}
                  required
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                />
              </div>
            ) : formData.itemType === 'pension' ? (
              <>
                <div className="form-group">
                  <label htmlFor="initialInvestment">סך השקעה ראשונית *</label>
                  <input
                    type="number"
                    id="initialInvestment"
                    name="initialInvestment"
                    value={formData.initialInvestment}
                    onChange={handleInputChange}
                    required
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="currentValue">סך ערך השקעה כיום *</label>
                  <input
                    type="number"
                    id="currentValue"
                    name="currentValue"
                    value={formData.currentValue}
                    onChange={handleInputChange}
                    required
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="previousValue">סך ערך ההשקעה בעדכון הקודם *</label>
                  <input
                    type="number"
                    id="previousValue"
                    name="previousValue"
                    value={formData.previousValue}
                    onChange={handleInputChange}
                    required
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                  />
                </div>
              </>
            ) : formData.itemType === 'bank' ? (
              <div className="form-group">
                <label htmlFor="purchasePrice">סכום בעו"ש *</label>
                <input
                  type="number"
                  id="purchasePrice"
                  name="purchasePrice"
                  value={formData.purchasePrice}
                  onChange={handleInputChange}
                  required
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                />
              </div>
            ) : formData.itemType === 'cash_fund' ? (
              <div className="form-group">
                <label htmlFor="purchasePrice">סכום *</label>
                <input
                  type="number"
                  id="purchasePrice"
                  name="purchasePrice"
                  value={formData.purchasePrice}
                  onChange={handleInputChange}
                  required
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                />
              </div>
            ) : null}

            {formData.itemType === 'stock' && (
              <div className="form-group">
                <label htmlFor="quantity">כמות *</label>
                <input
                  type="number"
                  id="quantity"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleInputChange}
                  required
                  min="1"
                  placeholder="1"
                />
              </div>
            )}

            {formData.itemType === 'stock' && (
              <div className="form-group">
                <label htmlFor="exchange">בורסה *</label>
                <select
                  id="exchange"
                  name="exchange"
                  value={formData.exchange}
                  onChange={handleInputChange}
                  required
                >
                  <option value="israeli">בורסה ישראלית</option>
                  <option value="american">בורסה אמריקאית</option>
                </select>
              </div>
            )}

            {formData.itemType === 'stock' && formData.exchange === 'american' && (
              <div className="form-group">
                <label htmlFor="exchangeRate">שער חליפין ביום הקנייה *</label>
                <input
                  type="number"
                  id="exchangeRate"
                  name="exchangeRate"
                  value={formData.exchangeRate}
                  onChange={handleInputChange}
                  required={formData.exchange === 'american'}
                  step="0.0001"
                  min="0"
                  placeholder="3.5000"
                />
              </div>
            )}

            <div className="form-buttons">
              <button type="button" onClick={handleBackToHome} className="back-button">
                חזרה לדף הבית
              </button>
              {isEditMode ? (
                <>
                  <button type="button" onClick={handleSaveEdit} className="submit-button">
                    שמור שינויים
                  </button>
                  <button type="button" onClick={handleCancelEdit} className="cancel-button">
                    ביטול
                  </button>
                </>
              ) : (
                <button type="submit" className="submit-button">
                  שמור מידע
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default StockFormView;
