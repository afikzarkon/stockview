import { renderHook, act } from '@testing-library/react';
import { useRoute } from './useRoute';

// jsdom starts every test at "/", and history.pushState works in it, so the
// hook can be exercised against a real History API rather than a stub.
function goTo(path) {
  window.history.replaceState({}, '', path);
}

describe('useRoute', () => {
  afterEach(() => {
    goTo('/');
  });

  test('starts on the page the current URL names', () => {
    goTo('/us-stocks');
    const { result } = renderHook(() => useRoute());
    expect(result.current.page).toBe('us-stocks');
  });

  test('an unknown URL starts on home rather than on nothing', () => {
    goTo('/does-not-exist');
    const { result } = renderHook(() => useRoute());
    expect(result.current.page).toBe('home');
  });

  test('navigating changes both the page and the address bar', () => {
    const { result } = renderHook(() => useRoute());

    act(() => result.current.navigate('monthly-tracker'));

    expect(result.current.page).toBe('monthly-tracker');
    expect(window.location.pathname).toBe('/monthly-tracker');
  });

  // Otherwise the back button appears to do nothing: it walks back through
  // duplicate entries for the page the user is already on.
  test('navigating to the page already open adds no history entry', () => {
    goTo('/analytics');
    const { result } = renderHook(() => useRoute());
    const before = window.history.length;

    act(() => result.current.navigate('analytics'));

    expect(window.history.length).toBe(before);
    expect(result.current.page).toBe('analytics');
  });

  test('follows the browser back/forward buttons', () => {
    const { result } = renderHook(() => useRoute());

    act(() => result.current.navigate('bank-savings'));
    expect(result.current.page).toBe('bank-savings');

    // popstate is what the browser fires on back/forward; jsdom does not
    // fire it for history.back(), so it is dispatched directly after
    // putting the URL where back would have left it.
    act(() => {
      window.history.replaceState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(result.current.page).toBe('home');
  });

  // A short page opened from halfway down a long one should start at its
  // own top, not below its own content.
  test('scrolls to the top of each newly opened page', () => {
    const scrollTo = jest.fn();
    window.scrollTo = scrollTo;
    const { result } = renderHook(() => useRoute());

    act(() => result.current.navigate('tax-offset'));

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });
});
