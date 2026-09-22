export const passwordRules = Object.freeze({
    length: value => value.length >= 8,
    uppercase: value => /[A-Z]/.test(value),
    lowercase: value => /[a-z]/.test(value),
    number: value => /\d/.test(value),
    special: value => /[^A-Za-z0-9\s]/.test(value)
});

export function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidUsername(username) {
    return /^[A-Za-z0-9_]{3,30}$/.test(username);
}

export function isStrongPassword(password) {
    return Object.values(passwordRules).every(validate => validate(password));
}
