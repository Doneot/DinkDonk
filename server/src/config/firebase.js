const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const { env } = require('./env');

function createFirestore() {
  if (!admin.apps.length) {
    if (env.firebase.serviceAccountPath) {
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
    } else {
      admin.initializeApp({
        credential: admin.credential.cert({
          type: 'service_account',
          project_id: env.firebase.projectId,
          private_key_id: env.firebase.privateKeyId,
          private_key: env.firebase.privateKey,
          client_email: env.firebase.clientEmail,
          client_id: env.firebase.clientId,
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
          auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
          client_x509_cert_url: env.firebase.clientX509CertUrl,
          universe_domain: 'googleapis.com',
        }),
      });
    }
  }

  return getFirestore();
}

module.exports = { admin, createFirestore };
