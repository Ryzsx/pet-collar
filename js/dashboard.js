// =============================================
// IMPORTS FROM FIREBASE INIT (Module)
// =============================================
import {
    auth,
    db,
    signOut,
    onAuthStateChanged,
    getCurrentUser,
    getUserData,
    getPetsForUser,
    saveLocation,
    getLocationHistory,
    listenToLocations,
    formatDate,
    timeAgo,
    updateUserProfile,
    saveUserData,
    collection,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    addDoc,
    serverTimestamp
} from '../js/firebase-init.js';

// =============================================
// DOM ELEMENTS
// =============================================
const userNameDisplay = document.getElementById('userName');
const userEmailDisplay = document.getElementById('userEmail');
const userAvatar = document.getElementById('userAvatar');
const greetingName = document.getElementById('greetingName');
const petDetails = document.getElementById('petDetails');
const logoutBtn = document.getElementById('logoutBtn');

// Stats
const statHeartRate = document.getElementById('statHeartRate');
const statLocationDisplay = document.getElementById('statLocationDisplay');
const statActivity = document.getElementById('statActivity');
const statTemp = document.getElementById('statTemp');
const heartStatusText = document.getElementById('heartStatusText');
const tempStatus = document.getElementById('tempStatus');
const gpsSignalDisplay = document.getElementById('gpsSignalDisplay');
const activitySub = document.getElementById('activitySub');

// GPS
const statLocation = document.getElementById('statLocation');
const gpsStatus = document.getElementById('gpsStatus');
const locationUpdate = document.getElementById('locationUpdate');
const gpsSignalStrength = document.getElementById('gpsSignalStrength');
const mapTitle = document.getElementById('mapTitle');
const mapLocationText = document.getElementById('mapLocationText');
const gpsLiveText = document.getElementById('gpsLiveText');
const gpsLiveDot = document.getElementById('gpsLiveDot');

// Live monitoring
const liveHeartRate = document.getElementById('liveHeartRate');
const liveLocation = document.getElementById('liveLocation');
const liveActivity = document.getElementById('liveActivity');
const liveHeartStatus = document.getElementById('liveHeartStatus');
const liveLocationStatus = document.getElementById('liveLocationStatus');
const liveActivityStatus = document.getElementById('liveActivityStatus');

// Profile
const profileName = document.getElementById('profileName');
const profileEmail = document.getElementById('profileEmail');

// Add Pet Banner
const addPetBanner = document.getElementById('addPetBanner');

// Settings
const showStatsToggle = document.getElementById('showStatsToggle');
const statsGrid = document.getElementById('statsGrid');
const darkModeToggle = document.getElementById('darkModeToggle');

// =============================================
// SIDEBAR TOGGLE
// =============================================
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const floatingToggle = document.getElementById('floatingToggle');
const expandArea = document.getElementById('sidebarExpandArea');

function toggleSidebar() {
    if (!sidebar) return;
    sidebar.classList.toggle('collapsed');
    const isCollapsed = sidebar.classList.contains('collapsed');
    localStorage.setItem('sidebarCollapsed', isCollapsed);
    // Toggle floating button visibility
    if (floatingToggle) {
        floatingToggle.style.display = isCollapsed ? 'flex' : 'none';
    }
}

if (sidebarToggle) {
    sidebarToggle.addEventListener('click', toggleSidebar);
}
if (floatingToggle) {
    floatingToggle.addEventListener('click', toggleSidebar);
}
if (expandArea) {
    expandArea.addEventListener('click', toggleSidebar);
}

document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
    }
});

const savedSidebarState = localStorage.getItem('sidebarCollapsed');
if (savedSidebarState === 'true' && sidebar) {
    sidebar.classList.add('collapsed');
    if (floatingToggle) {
        floatingToggle.style.display = 'flex';
    }
} else {
    if (floatingToggle) {
        floatingToggle.style.display = 'none';
    }
}

console.log('✅ Sidebar toggle ready!');

// =============================================
// STATE
// =============================================
let currentUser = null;
let currentUserId = null;
let pets = [];
let isStatsVisible = true;
let locationInterval = null;
let selectedPetId = null;
let liveDataInterval = null;
let locationUnsubscribe = null;

// =============================================
// NAVIGATION
// =============================================
function showSection(sectionId, button) {
    const sections = document.querySelectorAll('.page-section');
    const navItems = document.querySelectorAll('.nav-item');

    sections.forEach(section => {
        section.style.display = 'none';
    });

    navItems.forEach(item => {
        item.classList.remove('active');
    });

    if (sectionId === 'overview') {
        document.getElementById('mapSection').style.display = 'block';
        document.getElementById('statsGrid').style.display = isStatsVisible ? 'grid' : 'none';
        document.getElementById('liveSection').style.display = 'block';
        document.getElementById('addPetBanner').style.display = pets.length === 0 ? 'block' : 'none';
        document.getElementById('greetingName').textContent = currentUser?.displayName || 'User';

        if (button) {
            button.classList.add('active');
        } else {
            document.querySelector('[data-section="overview"]')?.classList.add('active');
        }
        return;
    }

    document.getElementById('mapSection').style.display = 'none';
    document.getElementById('statsGrid').style.display = 'none';
    document.getElementById('liveSection').style.display = 'none';
    document.getElementById('addPetBanner').style.display = 'none';

    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.style.display = 'block';
    }

    if (button) {
        button.classList.add('active');
    }

    if (sectionId === 'history') loadHistory();
    if (sectionId === 'pets') loadPetList();
    if (sectionId === 'profile') loadProfile();
}

// =============================================
// TOGGLE STATS
// =============================================
function toggleStats() {
    isStatsVisible = !isStatsVisible;
    statsGrid.style.display = isStatsVisible ? 'grid' : 'none';
    if (showStatsToggle) showStatsToggle.checked = isStatsVisible;
    if (currentUserId) {
        localStorage.setItem(`statsVisible_${currentUserId}`, isStatsVisible);
    }
}

// =============================================
// GPS FUNCTIONS
// =============================================
function refreshGPS() {
    if (!selectedPetId || pets.length === 0) {
        updateGPSStatus('No pet', 'error');
        return;
    }
    updateGPSStatus('Refreshing...', 'searching');
    setTimeout(() => {
        const coords = getRandomCoordinates();
        updateLocation(coords.lat, coords.lng);
    }, 1000);
}

function centerMap() {
    const marker = document.getElementById('mapMarker');
    if (marker) {
        marker.style.transform = 'scale(1.2)';
        setTimeout(() => {
            marker.style.transform = 'scale(1)';
        }, 500);
    }
    updateGPSStatus('Centered', 'good');
}

// =============================================
// UPDATE LOCATION
// =============================================
function updateLocation(lat, lng) {
    const locationName = getLocationName(lat, lng);

    statLocation.textContent = locationName;
    statLocationDisplay.textContent = locationName;
    liveLocation.textContent = locationName;
    mapTitle.textContent = `📍 ${locationName}`;
    mapLocationText.textContent = `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`;
    gpsSignalStrength.textContent = 'Strong';
    gpsSignalStrength.style.color = '#10b981';
    gpsStatus.textContent = '✅ Connected';
    gpsLiveText.textContent = 'Live';
    gpsLiveDot.style.background = '#10b981';
    liveLocationStatus.textContent = '● Active';
    liveLocationStatus.className = 'live-status good';
    locationUpdate.textContent = 'Just now';

    if (currentUserId && selectedPetId) {
        saveLocation({
            petId: selectedPetId,
            lat: lat,
            lng: lng,
            locationName: locationName
        }, currentUserId);
    }

    const marker = document.getElementById('mapMarker');
    if (marker) {
        marker.style.transform = 'scale(1.1)';
        setTimeout(() => {
            marker.style.transform = 'scale(1)';
        }, 300);
    }
}

function updateGPSStatus(status, type = 'normal') {
    const dot = document.getElementById('gpsLiveDot');
    const text = document.getElementById('gpsLiveText');
    const statusText = document.getElementById('gpsStatus');

    if (type === 'searching') {
        dot.style.background = '#f59e0b';
        text.textContent = 'Searching...';
        statusText.textContent = '⏳ Searching...';
    } else if (type === 'good') {
        dot.style.background = '#10b981';
        text.textContent = 'Live';
        statusText.textContent = '✅ Connected';
    } else if (type === 'error') {
        dot.style.background = '#ef4444';
        text.textContent = 'No Pet';
        statusText.textContent = '❌ No pet selected';
    }
}

function getRandomCoordinates() {
    const lat = 14.5995 + (Math.random() - 0.5) * 0.02;
    const lng = 120.9842 + (Math.random() - 0.5) * 0.02;
    return { lat, lng };
}

function getLocationName(lat, lng) {
    const locations = [
        '📍 Manila, Philippines',
        '📍 Quezon City, Philippines',
        '📍 Makati, Philippines',
        '📍 Taguig, Philippines',
        '📍 Pasig, Philippines',
        '📍 Mandaluyong, Philippines'
    ];
    return locations[Math.floor(Math.random() * locations.length)];
}

// =============================================
// SIMULATE LIVE DATA
// =============================================
function simulateLiveData() {
    if (!selectedPetId || pets.length === 0) {
        statHeartRate.textContent = '--';
        statActivity.textContent = '--';
        statTemp.textContent = '--';
        liveHeartRate.textContent = '--';
        liveActivity.textContent = '--';
        heartStatusText.textContent = '⏳ No pet selected';
        heartStatusText.className = '';
        tempStatus.textContent = '⏳ No pet selected';
        tempStatus.className = '';
        liveHeartStatus.textContent = '● No pet';
        liveHeartStatus.className = 'live-status';
        liveActivityStatus.textContent = '● No pet';
        liveActivityStatus.className = 'live-status';
        activitySub.textContent = '--';
        return;
    }

    const heartRate = Math.floor(Math.random() * 60) + 60;
    const hrStatus = heartRate < 80 ? 'normal' : heartRate < 100 ? 'elevated' : 'high';
    const activity = Math.floor(Math.random() * 100);
    const activityStatus = activity < 30 ? 'resting' : activity < 70 ? 'active' : 'very active';
    const temp = (Math.random() * 3 + 36).toFixed(1);
    const tempStatusVal = temp < 37.5 ? 'normal' : temp < 38.5 ? 'elevated' : 'high';

    statHeartRate.textContent = heartRate;
    statActivity.textContent = activity + '%';
    statTemp.textContent = temp;
    liveHeartRate.textContent = heartRate;
    liveActivity.textContent = activity + '%';

    const heartStatusMap = {
        'normal': '● Normal',
        'elevated': '● Elevated',
        'high': '● High'
    };
    const tempStatusMap = {
        'normal': '✅ Normal',
        'elevated': '⚠️ Elevated',
        'high': '⚠️ High'
    };

    heartStatusText.textContent = heartStatusMap[hrStatus] || '⏳ Waiting...';
    heartStatusText.className = hrStatus === 'normal' ? 'normal-status' : 'warning-status';
    tempStatus.textContent = tempStatusMap[tempStatusVal] || '⏳ Waiting...';
    tempStatus.className = tempStatusVal === 'normal' ? 'normal-status' : 'warning-status';

    liveHeartStatus.textContent = '● ' + (hrStatus === 'normal' ? 'Normal' : hrStatus === 'elevated' ? 'Elevated' : 'High');
    liveHeartStatus.className = 'live-status ' + (hrStatus === 'normal' ? 'good' : hrStatus === 'elevated' ? 'warning' : 'danger');

    liveActivityStatus.textContent = '● ' + activityStatus.charAt(0).toUpperCase() + activityStatus.slice(1);
    liveActivityStatus.className = 'live-status ' + (activityStatus === 'resting' ? 'good' : activityStatus === 'active' ? 'warning' : 'danger');

    activitySub.textContent = activityStatus.charAt(0).toUpperCase() + activityStatus.slice(1);
}

// =============================================
// LOAD PETS
// =============================================
async function loadPets() {
    if (!currentUserId) return;
    const result = await getPetsForUser(currentUserId);
    if (result.success && result.pets.length > 0) {
        pets = result.pets;
        // Restore last selected pet from localStorage
        const lastPetId = localStorage.getItem(`lastPet_${currentUserId}`);
        selectedPetId = pets.find(p => p.id === lastPetId)?.id || pets[0].id;
        const pet = pets.find(p => p.id === selectedPetId);
        petDetails.textContent = `🐕 ${pet.name || 'Pet'} • ${pet.breed || 'Mixed Breed'}`;
        addPetBanner.style.display = 'none';
        loadPetList();
        if (selectedPetId) startLocationTracking();
        
        if (liveDataInterval) clearInterval(liveDataInterval);
        simulateLiveData();
        liveDataInterval = setInterval(simulateLiveData, 5000);
    } else {
        pets = [];
        selectedPetId = null;
        petDetails.textContent = 'No pet added yet';
        addPetBanner.style.display = 'block';
        
        if (liveDataInterval) clearInterval(liveDataInterval);
        simulateLiveData();
        if (locationInterval) clearInterval(locationInterval);
        updateGPSStatus('No pet', 'error');
        statLocation.textContent = 'No pet selected';
        statLocationDisplay.textContent = 'No pet';
        liveLocation.textContent = 'No pet';
        mapTitle.textContent = '📍 No pet selected';
        mapLocationText.textContent = 'Add a pet to start tracking';
        gpsSignalStrength.textContent = 'N/A';
        gpsSignalStrength.style.color = '#94a3b8';
    }
}

function startLocationTracking() {
    if (locationInterval) clearInterval(locationInterval);
    if (!selectedPetId || pets.length === 0) return;
    
    const coords = getRandomCoordinates();
    updateLocation(coords.lat, coords.lng);
    locationInterval = setInterval(() => {
        if (selectedPetId && pets.length > 0) {
            const newCoords = getRandomCoordinates();
            updateLocation(newCoords.lat, newCoords.lng);
            document.getElementById('locationUpdate').textContent = 'Just now';
        }
    }, 10000);
}

// =============================================
// LOAD HISTORY
// =============================================
async function loadHistory() {
    const tbody = document.getElementById('historyTableBody');
    if (!currentUserId || !selectedPetId) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:40px;">🐾 No location history yet</td></tr>`;
        return;
    }
    const result = await getLocationHistory(currentUserId, 50);
    if (result.success && result.locations.length > 0) {
        tbody.innerHTML = result.locations.map(loc => `
            <tr>
                <td>${formatDate(loc.timestamp) || 'Just now'}</td>
                <td>${loc.locationName || 'Unknown location'}</td>
                <td>${loc.lat ? loc.lat.toFixed(6) + ', ' + loc.lng.toFixed(6) : '--'}</td>
                <td>${loc.activity || 'Walking'}</td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:40px;">🐾 No location history yet</td></tr>`;
    }
}

// =============================================
// LOAD PET LIST
// =============================================
async function loadPetList() {
    const container = document.getElementById('petListContainer');
    if (pets.length === 0) {
        container.innerHTML = `<div style="text-align:center;padding:40px;color:#94a3b8;"><p>🐾 No pets added yet</p><small>Click "Add New Pet" to get started</small></div>`;
        return;
    }
    container.innerHTML = pets.map(pet => `
        <div class="pet-card" data-pet-id="${pet.id}">
            <div class="pet-avatar">🐕</div>
            <div class="pet-details">
                <h3>${pet.name || 'Pet'}</h3>
                <p>${pet.breed || 'Mixed Breed'} • ${pet.age || 'Unknown'} yrs</p>
            </div>
            <div style="margin-left:auto;padding:4px 12px;border-radius:20px;font-size:12px;background:${pet.status === 'active' ? '#ecfdf5' : '#f1f5f9'};color:${pet.status === 'active' ? '#10b981' : '#94a3b8'};">
                ${pet.status === 'active' ? '● Online' : '● Offline'}
            </div>
        </div>
    `).join('');

    // Add click listeners to pet cards
    document.querySelectorAll('.pet-card').forEach(card => {
        card.addEventListener('click', function() {
            const petId = this.dataset.petId;
            selectPet(petId);
        });
    });
}

function selectPet(petId) {
    selectedPetId = petId;
    localStorage.setItem(`lastPet_${currentUserId}`, petId);
    const pet = pets.find(p => p.id === petId);
    if (pet) {
        petDetails.textContent = `🐕 ${pet.name || 'Pet'} • ${pet.breed || 'Mixed Breed'}`;
        startLocationTracking();
        if (liveDataInterval) clearInterval(liveDataInterval);
        simulateLiveData();
        liveDataInterval = setInterval(simulateLiveData, 5000);
        showSection('overview');
    }
}

// =============================================
// LOAD PROFILE
// =============================================
async function loadProfile() {
    if (!currentUser) return;
    profileName.value = currentUser.displayName || '';
    profileEmail.value = currentUser.email || '';
    if (currentUserId) {
        const result = await getUserData(currentUserId);
        if (result.success && result.data && result.data.fullName) {
            profileName.value = result.data.fullName;
        }
    }
}

async function updateProfile() {
    const name = profileName.value.trim();
    if (!name) { alert('Please enter your name'); return; }
    try {
        if (currentUser) {
            await currentUser.updateProfile({ displayName: name });
        }
        if (currentUserId) {
            await setDoc(doc(db, 'users', currentUserId), {
                fullName: name,
                updatedAt: serverTimestamp()
            }, { merge: true });
        }
        userNameDisplay.textContent = name;
        greetingName.textContent = name;
        alert('Profile updated successfully!');
    } catch (error) {
        console.error('Error updating profile:', error);
        alert('Error updating profile. Please try again.');
    }
}

// =============================================
// AUTHENTICATION STATE
// =============================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        currentUserId = user.uid;

        // --- Store user info for "Continue as" ---
        localStorage.setItem('lastUserEmail', user.email);
        localStorage.setItem('lastUserName', user.displayName || user.email.split('@')[0]);
        localStorage.setItem('lastUserAvatar', user.photoURL || '👤');

        userNameDisplay.textContent = user.displayName || 'User';
        userEmailDisplay.textContent = user.email || '';
        greetingName.textContent = user.displayName || 'User';
        userAvatar.textContent = user.displayName ? user.displayName.charAt(0).toUpperCase() : '👤';
        profileEmail.value = user.email || '';

        const result = await getUserData(user.uid);
        if (result.success && result.data && result.data.fullName) {
            userNameDisplay.textContent = result.data.fullName;
            greetingName.textContent = result.data.fullName;
            profileName.value = result.data.fullName;
        }

        await loadPets();

        const savedStats = localStorage.getItem(`statsVisible_${user.uid}`);
        if (savedStats !== null) {
            isStatsVisible = savedStats === 'true';
            statsGrid.style.display = isStatsVisible ? 'grid' : 'none';
            if (showStatsToggle) showStatsToggle.checked = isStatsVisible;
        }

        showSection('overview');

        console.log('✅ User logged in:', user.email);
    } else {
        window.location.href = '../pages/login.html';
    }
});

// =============================================
// LOGOUT
// =============================================
logoutBtn.addEventListener('click', async () => {
    if (locationInterval) clearInterval(locationInterval);
    if (liveDataInterval) clearInterval(liveDataInterval);
    if (locationUnsubscribe) {
        locationUnsubscribe();
        locationUnsubscribe = null;
    }

    if (currentUser) {
        localStorage.setItem('lastUserEmail', currentUser.email);
        localStorage.setItem('lastUserName', currentUser.displayName || currentUser.email.split('@')[0]);
        localStorage.setItem('lastUserAvatar', currentUser.photoURL || '👤');
    }

    const result = await signOut();
    if (result.success) {
        window.location.href = '../pages/login.html';
    } else {
        alert('Error signing out. Please try again.');
    }
});

// =============================================
// SETTINGS TOGGLES
// =============================================
if (showStatsToggle) {
    showStatsToggle.addEventListener('change', function() {
        isStatsVisible = this.checked;
        statsGrid.style.display = isStatsVisible ? 'grid' : 'none';
        if (currentUserId) {
            localStorage.setItem(`statsVisible_${currentUserId}`, isStatsVisible);
        }
    });
}

if (darkModeToggle) {
    darkModeToggle.addEventListener('change', function() {
        document.body.classList.toggle('dark-mode', this.checked);
        localStorage.setItem('darkMode', this.checked);
    });
    const darkModePref = localStorage.getItem('darkMode');
    if (darkModePref === 'true') {
        darkModeToggle.checked = true;
        document.body.classList.add('dark-mode');
    }
}

// =============================================
// CONNECTION STATUS (using events instead of interval)
// =============================================
const connectionStatus = document.getElementById('connectionStatus');

function updateConnectionStatus() {
    const isOnline = navigator.onLine;
    if (connectionStatus) {
        connectionStatus.innerHTML = `
            <span class="status-dot" style="background:${isOnline ? '#10b981' : '#ef4444'};"></span>
            ${isOnline ? 'Connected' : 'Disconnected'}
        `;
    }
}

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);
updateConnectionStatus(); // Initial check

// =============================================
// ATTACH EVENT LISTENERS FOR ALL INTERACTIVE ELEMENTS
// =============================================

// 1. Navigation items
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function(e) {
        const section = this.dataset.section;
        if (section) showSection(section, this);
    });
});

// 2. GPS Control Buttons
document.getElementById('refreshGPSBtn')?.addEventListener('click', refreshGPS);
document.getElementById('centerMapBtn')?.addEventListener('click', centerMap);
document.getElementById('toggleStatsBtn')?.addEventListener('click', toggleStats);

// 3. Add Pet buttons
document.querySelector('.banner-btn')?.addEventListener('click', function() {
    window.location.href = 'pet-setup.html';
});
document.getElementById('addPetBtn')?.addEventListener('click', function() {
    window.location.href = 'pet-setup.html';
});

// 4. Save Profile button
document.getElementById('saveProfileBtn')?.addEventListener('click', updateProfile);

// 5. Settings toggle for GPS (optional extra)
document.getElementById('gpsToggle')?.addEventListener('change', function() {
    if (this.checked) {
        startLocationTracking();
    } else {
        if (locationInterval) clearInterval(locationInterval);
        updateGPSStatus('GPS Off', 'error');
        gpsStatus.textContent = '⏹️ GPS Disabled';
    }
});

// =============================================
// EXPOSE FUNCTIONS GLOBALLY FOR INLINE ONCLICK (backup)
// =============================================
window.showSection = showSection;
window.toggleStats = toggleStats;
window.refreshGPS = refreshGPS;
window.centerMap = centerMap;
window.selectPet = selectPet;
window.updateProfile = updateProfile;

console.log('🚀 Dashboard loaded successfully!');
console.log('📡 Starting live monitoring...');