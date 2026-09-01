// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// The jsdom version CRA5 bundles doesn't provide TextEncoder/TextDecoder,
// which jsPDF's dependency chain (fast-png -> iobuffer) references at
// import time - so any jsdom-environment test that renders a component
// importing exportReport.js (even indirectly, e.g. HomeView.js) would
// otherwise fail with "TextEncoder is not defined" before the test body
// even runs. Node has always had these globally; just re-expose them.
global.TextEncoder = require('util').TextEncoder;
global.TextDecoder = require('util').TextDecoder;
