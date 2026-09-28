import assert from 'node:assert/strict';
import { isValidEmail, isValidUsername, isStrongPassword, passwordRules } from '../js/utils/validators.js';

assert.equal(isValidEmail('owner@example.com'), true);
assert.equal(isValidEmail('owner@invalid'), false);
assert.equal(isValidUsername('Pet_Owner1'), true);
assert.equal(isValidUsername('ab'), false);
assert.equal(isValidUsername('bad-name'), false);
assert.equal(isStrongPassword('Collar123!'), true);
assert.equal(isStrongPassword('collar123!'), false);
assert.equal(isStrongPassword('Collar123'), false);
assert.deepEqual(Object.keys(passwordRules), ['length', 'uppercase', 'lowercase', 'number', 'special']);

console.log('Shared registration and reset validation rules passed.');
