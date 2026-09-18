import admin from 'firebase-admin';
import { getDatabase } from 'firebase-admin/database';
import { getMessaging } from 'firebase-admin/messaging';
import { storage } from '../storage';

let isInitialized = false;

export async function initFirebaseAdmin() {
  if (isInitialized) return admin;

  try {
    const [projectId, clientEmail, privateKey] = await Promise.all([
      storage.getSettingByKey('firebase_project_id'),
      storage.getSettingByKey('firebase_client_email'),
      storage.getSettingByKey('firebase_private_key'),
    ]);

    if (projectId?.value && clientEmail?.value && privateKey?.value) {
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: projectId.value,
            clientEmail: clientEmail.value,
            privateKey: privateKey.value.replace(/\\n/g, '\n'),
          }),
          databaseURL: `https://${projectId.value}.firebaseio.com`,
        });
      }
      isInitialized = true;
      console.log('🔥 Firebase Admin initialized from database settings');
    } else {
      console.warn('⚠ Firebase Admin settings missing in database');
    }
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin:', error);
  }

  return admin;
}

export const getAdminDb = async () => {
  await initFirebaseAdmin();
  return getDatabase();
};

export const getAdminMessaging = async () => {
  await initFirebaseAdmin();
  return getMessaging();
};

export default admin;
