const fs = require("fs");

function readSecret(name) {
  const path = `/run/secrets/${name}`;

  if (!fs.existsSync(path)) {
    return undefined;
  }

  return fs.readFileSync(path, "utf8").trim();
}

function envOrSecret(envName, secretName = envName.toLowerCase()) {
  return process.env[envName] || readSecret(secretName);
}

module.exports = {
  envOrSecret,
};
