// frontend/src/store/guestStorage.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const GUEST_ID_KEY = 'nitor8_guest_id';

function genUUID() {
  try {
    return Crypto.randomUUID();
  } catch (e) {
    // SDK 50 Web 간헐 이슈 대비 fallback
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

export async function initGuestId() {
  let id = await AsyncStorage.getItem(GUEST_ID_KEY);
  if (!id) {
    id = genUUID();
    await AsyncStorage.setItem(GUEST_ID_KEY, id);
  }
  return id;
}

export async function getGuestId() {
  return AsyncStorage.getItem(GUEST_ID_KEY);
}
