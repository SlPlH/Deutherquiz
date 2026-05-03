const firebaseConfig = {
  apiKey: "AIzaSyCXwy1-Eh3KUsFeSYpLpKdv8vTPE_7ylNU",
  authDomain: "bil-ve-fethet-2348c.firebaseapp.com",
  databaseURL: "https://bil-ve-fethet-2348c-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "bil-ve-fethet-2348c",
  storageBucket: "bil-ve-fethet-2348c.firebasestorage.app",
  messagingSenderId: "255163203633",
  appId: "1:255163203633:web:20e507947d56d59effd510"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();
