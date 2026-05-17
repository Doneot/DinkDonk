function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeTwitchLogin(login) {
  return isNonEmptyString(login) ? login.trim().toLowerCase() : '';
}

module.exports = { isNonEmptyString, normalizeTwitchLogin };
