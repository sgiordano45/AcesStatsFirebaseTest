// firebase-auth.js (REFACTORED)
// Authentication module that uses EXISTING player profile documents
// No duplicate user documents created!

import { getAuth, 
         createUserWithEmailAndPassword,
         signInWithEmailAndPassword,
         signInWithPopup,
         GoogleAuthProvider,
         signOut,
         onAuthStateChanged,
         sendPasswordResetEmail,
         sendEmailVerification,
         updateProfile
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

import { doc, setDoc, getDoc, updateDoc, serverTimestamp, collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Import your existing Firebase app and db
import { app, db } from './firebase-data.js';

// Initialize Firebase Authentication
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// ========================================
// CORE CONCEPT:
// - Firebase Auth creates authentication with UID
// - We link that UID to existing player profile documents
// - Player profiles are identified by snake_case name (e.g., "stephen_giordano")
// - Auth info (email, photoURL, UID) stored IN the player profile
// ========================================

// ========================================
// AUTHENTICATION FUNCTIONS
// ========================================

/**
 * Register new user with email and password
 */
export async function registerUser(email, password, displayName) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    await updateProfile(user, { displayName });
    await sendEmailVerification(user);
    
    // Create a temporary auth-only record until they link to a player
    await createTempAuthRecord(user.uid, {
      email: user.email,
      displayName: displayName,
      authProvider: 'email',
      emailVerified: false
    });
    
    console.log('✅ User registered:', displayName);
    return { success: true, user, message: 'Account created! Please check your email to verify.' };
  } catch (error) {
    console.error('❌ Registration error:', error.code);
    return { success: false, error: error.code, message: getErrorMessage(error.code) };
  }
}

/**
 * Sign in with email and password
 */
export async function loginUser(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log('✅ User logged in:', userCredential.user.displayName);
    return { success: true, user: userCredential.user };
  } catch (error) {
    console.error('❌ Login error:', error.code);
    return { success: false, error: error.code, message: getErrorMessage(error.code) };
  }
}

/**
 * Sign in with Google
 */
export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    console.log('✅ Google sign-in successful:', user.displayName);
    
    // Check if this Firebase Auth UID is already linked to a player profile
    const linkedProfile = await findProfileByAuthUID(user.uid);
    
    if (!linkedProfile) {
      // Not linked yet - create temporary auth record
      await createTempAuthRecord(user.uid, {
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        authProvider: 'google',
        emailVerified: user.emailVerified
      });
      console.log('ℹ️ New user - needs to link to player profile');
    } else {
      console.log('✅ Linked to player profile:', linkedProfile.id);
    }
    
    return { success: true, user };
  } catch (error) {
    console.error('❌ Google sign-in error:', error.code, error.message);
    console.error('Full error:', error);
    return { success: false, error: error.code, message: error.message || getErrorMessage(error.code) };
  }
}

/**
 * Sign out current user
 */
export async function logoutUser() {
  try {
    await signOut(auth);
    console.log('✅ User signed out');
    return { success: true };
  } catch (error) {
    console.error('❌ Sign out error:', error);
    return { success: false, error: error.code };
  }
}

/**
 * Send password reset email
 */
export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    console.log('✅ Password reset email sent to:', email);
    return { success: true, message: 'Password reset email sent!' };
  } catch (error) {
    console.error('❌ Password reset error:', error.code);
    return { success: false, error: error.code, message: getErrorMessage(error.code) };
  }
}

/**
 * Get current user
 */
export function getCurrentUser() {
  return auth.currentUser;
}

/**
 * Listen to authentication state changes
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// ========================================
// PLAYER PROFILE LINKING (NEW APPROACH)
// ========================================

/**
 * Convert player name to document ID format
 * "Stephen Giordano" -> "stephen_giordano"
 */
function nameToDocId(name) {
  return name.toLowerCase().trim().replace(/\s+/g, '_');
}

/**
 * Convert document ID back to display name
 * "stephen_giordano" -> "Stephen Giordano"
 */
function docIdToName(docId) {
  return docId.split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Find player profile by Firebase Auth UID
 */
async function findProfileByAuthUID(authUID) {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('authUID', '==', authUID));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() };
    }
    return null;
  } catch (error) {
    console.error('Error finding profile by auth UID:', error);
    return null;
  }
}

/**
 * Create temporary auth-only record (stored with authUID as document ID)
 * This gets replaced when user links to actual player profile
 */
async function createTempAuthRecord(authUID, data) {
  const tempRef = doc(db, 'tempAuthUsers', authUID);
  await setDoc(tempRef, {
    ...data,
    createdAt: serverTimestamp(),
    isTemporary: true,
    linkedToProfile: false
  });
}

/**
 * Link Firebase Auth user to existing player profile
 * This is the KEY function - it connects auth to player profiles
 */
export async function linkPlayerToUser(authUID, playerName, teamId, isCaptain = false) {
  try {
    const user = auth.currentUser;
    if (!user || user.uid !== authUID) {
      throw new Error('Auth user mismatch');
    }
    
    // Convert player name to document ID
    const playerDocId = nameToDocId(playerName);
    
    // Get the existing player profile document
    const playerRef = doc(db, 'users', playerDocId);
    const playerDoc = await getDoc(playerRef);
    
    if (!playerDoc.exists()) {
      // Player profile doesn't exist - this might be a new player
      // Create the profile document
      await setDoc(playerRef, {
        displayName: playerName,
        name: playerName,
        currentTeam: teamId,
        isCaptain: isCaptain || false,
        // Auth info
        authUID: authUID,
        email: user.email,
        photoURL: user.photoURL || null,
        authProvider: user.providerData[0]?.providerId || 'unknown',
        emailVerified: user.emailVerified,
        // Metadata
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        linkedAt: serverTimestamp()
      });
      console.log('✅ Created new player profile:', playerDocId);
    } else {
      // Player profile exists - add auth info to it
      await updateDoc(playerRef, {
        authUID: authUID,
        email: user.email,
        photoURL: user.photoURL || null,
        authProvider: user.providerData[0]?.providerId || 'unknown',
        emailVerified: user.emailVerified,
        currentTeam: teamId,
        isCaptain: isCaptain || false,
        linkedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      console.log('✅ Updated existing player profile with auth info:', playerDocId);
    }
    
    // Delete temporary auth record if it exists
    try {
      const tempRef = doc(db, 'tempAuthUsers', authUID);
      const tempDoc = await getDoc(tempRef);
      if (tempDoc.exists()) {
        await tempDoc.ref.delete();
        console.log('🗑️ Deleted temporary auth record');
      }
    } catch (deleteError) {
      console.warn('Could not delete temp auth record:', deleteError);
    }
    
    console.log('✅ Successfully linked Firebase Auth to player profile');
    return { success: true };
    
  } catch (error) {
    console.error('❌ Error linking player:', error);
    return { success: false, error: error.code || error.message };
  }
}

/**
 * Unlink user from player profile (remove auth info from profile)
 */
export async function unlinkPlayer(authUID) {
  try {
    // Find the profile linked to this auth UID
    const linkedProfile = await findProfileByAuthUID(authUID);
    
    if (linkedProfile) {
      const playerRef = doc(db, 'users', linkedProfile.id);
      await updateDoc(playerRef, {
        authUID: null,
        email: null,
        photoURL: null,
        linkedAt: null,
        updatedAt: serverTimestamp()
      });
      console.log('✅ Unlinked player profile');
    }
    
    return { success: true };
  } catch (error) {
    console.error('❌ Error unlinking player:', error);
    return { success: false, error: error.code };
  }
}

/**
 * Get user profile (player profile with auth info)
 */
export async function getUserProfile(authUID) {
  try {
    // First, try to find by auth UID (linked profile)
    const linkedProfile = await findProfileByAuthUID(authUID);
    
    if (linkedProfile) {
      return { success: true, data: linkedProfile, isLinked: true };
    }
    
    // Not linked yet - check for temp auth record
    const tempRef = doc(db, 'tempAuthUsers', authUID);
    const tempDoc = await getDoc(tempRef);
    
    if (tempDoc.exists()) {
      return { 
        success: true, 
        data: { id: authUID, ...tempDoc.data() },
        isLinked: false,
        isTemporary: true
      };
    }
    
    return { success: false, message: 'User profile not found' };
  } catch (error) {
    console.error('❌ Error getting user profile:', error);
    return { success: false, error: error.code };
  }
}

/**
 * Update user profile
 */
export async function updateUserProfile(authUID, updates) {
  try {
    // Find linked profile
    const linkedProfile = await findProfileByAuthUID(authUID);
    
    if (!linkedProfile) {
      throw new Error('No linked player profile found');
    }
    
    const playerRef = doc(db, 'users', linkedProfile.id);
    await updateDoc(playerRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    
    console.log('✅ User profile updated');
    return { success: true };
  } catch (error) {
    console.error('❌ Error updating user profile:', error);
    return { success: false, error: error.code };
  }
}

/**
 * Add favorite team
 */
export async function addFavoriteTeam(authUID, teamId) {
  try {
    const linkedProfile = await findProfileByAuthUID(authUID);
    if (!linkedProfile) {
      throw new Error('No linked player profile');
    }
    
    const playerRef = doc(db, 'users', linkedProfile.id);
    const currentFavorites = linkedProfile.favoriteTeams || [];
    
    if (!currentFavorites.includes(teamId)) {
      currentFavorites.push(teamId);
      await updateDoc(playerRef, {
        favoriteTeams: currentFavorites,
        updatedAt: serverTimestamp()
      });
      console.log('✅ Favorite team added:', teamId);
    }
    
    return { success: true };
  } catch (error) {
    console.error('❌ Error adding favorite team:', error);
    return { success: false, error: error.code };
  }
}

/**
 * Add favorite player
 */
export async function addFavoritePlayer(authUID, playerName) {
  try {
    const linkedProfile = await findProfileByAuthUID(authUID);
    if (!linkedProfile) {
      throw new Error('No linked player profile');
    }
    
    const playerRef = doc(db, 'users', linkedProfile.id);
    const currentFavorites = linkedProfile.favoritePlayers || [];
    
    if (!currentFavorites.includes(playerName)) {
      currentFavorites.push(playerName);
      await updateDoc(playerRef, {
        favoritePlayers: currentFavorites,
        updatedAt: serverTimestamp()
      });
      console.log('✅ Favorite player added:', playerName);
    }
    
    return { success: true };
  } catch (error) {
    console.error('❌ Error adding favorite player:', error);
    return { success: false, error: error.code };
  }
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

function getErrorMessage(errorCode) {
  const errorMessages = {
    'auth/email-already-in-use': 'This email is already registered.',
    'auth/invalid-email': 'Invalid email address.',
    'auth/operation-not-allowed': 'Operation not allowed.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Please check your connection.',
    'auth/popup-closed-by-user': 'Sign-in popup was closed.',
    'auth/popup-blocked': 'Sign-in popup was blocked by your browser. Please allow popups for this site.'
  };
  return errorMessages[errorCode] || 'An error occurred. Please try again.';
}

// Export auth instance and helper functions
export { auth, nameToDocId, docIdToName };
