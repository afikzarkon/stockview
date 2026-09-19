import React from 'react';

// An asset's identity in a table cell: its name on the first line, and its
// machine identifier - a TASE security number or a US ticker - in mono
// underneath.
//
// These are two different kinds of fact and were previously crammed into
// one string ("טבע (629014)"). Splitting them lets the name take the
// reading weight while the identifier stays scannable and obviously a code,
// and it stops a long fund name and a 7-digit number fighting for the same
// line in a column that also has to stay narrow.
//
// `securityId` is optional: a US holding's ticker already IS its name, so
// passing only `name` renders a single line with no empty second row.
function AssetCell({ name, securityId, prefix = null }) {
  const showId = Boolean(securityId) && String(securityId) !== String(name);

  return (
    <span className="asset-cell">
      <span className="asset-cell-name">
        {prefix}
        {name}
      </span>
      {showId && <span className="asset-cell-id">{securityId}</span>}
    </span>
  );
}

export default AssetCell;
