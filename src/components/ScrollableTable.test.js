import { render, screen, within } from '@testing-library/react';
import ScrollableTable from './ScrollableTable';

const Example = (props) => (
  <ScrollableTable label="בורסה ישראלית" {...props}>
    <thead>
      <tr>
        <th>שם נייר</th>
        <th>שווי</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>טבע</td>
        <td>12,050.00 ₪</td>
      </tr>
    </tbody>
  </ScrollableTable>
);

describe('ScrollableTable', () => {
  // The structure is the point: a row of figures only means anything read
  // across, and a column only read down. Nothing here may substitute a
  // list of cards for that at any viewport.
  test('renders a real table, not a substitute structure', () => {
    render(<Example />);
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
    expect(within(table).getAllByRole('columnheader')).toHaveLength(2);
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByRole('cell', { name: 'טבע' })).toBeInTheDocument();
  });

  test('wraps the table in the scroll container the pinned column needs', () => {
    const { container } = render(<Example />);
    const box = container.querySelector('.table-container');
    expect(box).not.toBeNull();
    expect(box.querySelector('table')).not.toBeNull();
  });

  // A scrollable region that is not focusable cannot be scrolled by
  // keyboard at all - the columns past the fold are simply unreachable
  // without a mouse or a touchscreen.
  test('the scroll container is reachable and announced', () => {
    render(<Example />);
    const region = screen.getByRole('region', { name: 'בורסה ישראלית' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region).toHaveClass('table-container');
  });

  test('a table can declare its own width class alongside the shared one', () => {
    const { container } = render(<Example tableClassName="american-stocks-table" />);
    const table = container.querySelector('table');
    expect(table).toHaveClass('stocks-table');
    expect(table).toHaveClass('american-stocks-table');
  });

  test('omitting the width class leaves no trailing whitespace in the class list', () => {
    const { container } = render(<Example />);
    expect(container.querySelector('table').getAttribute('class')).toBe('stocks-table');
    expect(container.querySelector('div').getAttribute('class')).toBe('table-container');
  });
});
