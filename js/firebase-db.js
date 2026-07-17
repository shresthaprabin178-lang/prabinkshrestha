// ==========================================================================
// FIREBASE DATABASE CONFIGURATION
// ==========================================================================

// Import the functions you need from the SDKs you need
// import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
// import { getFirestore, collection, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// TODO: Replace the following with your app's Firebase project configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

// Initialize Firebase
let app;
let db;

try {
  // Uncomment below when keys are configured
  // app = initializeApp(firebaseConfig);
  // db = getFirestore(app);
  console.log("Firebase initialized successfully (Configuration baseline loaded).");
} catch (error) {
  console.error("Firebase failed to load:", error);
}

// Database helper functions template
async function saveCalculationProfile(profileName, shapeType, dimensions) {
  if (!db) {
    console.warn("Firebase Firestore is not initialized. Profiles can be stored locally.");
    // Fallback: LocalStorage
    const saved = JSON.parse(localStorage.getItem('steel_profiles') || '[]');
    saved.push({ id: Date.now(), name: profileName, shape: shapeType, dims: dimensions });
    localStorage.setItem('steel_profiles', JSON.stringify(saved));
    return;
  }

  try {
    // const docRef = await addDoc(collection(db, "steel_profiles"), {
    //   name: profileName,
    //   shape: shapeType,
    //   dimensions: dimensions,
    //   createdAt: new Date()
    // });
    // console.log("Profile saved with ID: ", docRef.id);
  } catch (e) {
    console.error("Error saving profile to Firestore: ", e);
  }
}
