import { DATA_MODE } from '../core/data-mode.js';
import { petService } from '../services/PetService.js';
import { uploadPetImage } from '../firebase-init.js';
import { placeholderPhotos, demoPets } from './demo-data.js';
import { $, escapeHtml, showToast } from './dom.js';
import {
    renderActivityPetSelector,
    getSelectedLivePetId,
    loadGoogleMaps,
    setLiveTrackingPets
} from './live-tracking.js';
import { updateActivityData } from './activity.js';

let pets =
    DATA_MODE === 'demo'
        ? demoPets.map(pet => ({ ...pet }))
        : [];

let selectedPetId =
    pets[0]?.id || null;
let currentUser = null;
let deletePetId = null;
let petLimitWarningTimer = null;

let newPetPhotoData = null;
let newPetPhotoFile = null;

let addPetMap = null;
let addPetSafeZoneMarker = null;
let addPetSafeZoneCircle = null;

let newSafeZoneCoordinates = null;          
let selectedSafeZoneAddress = null;

export function setPetManagementUser(user) {
    currentUser = user;
}

function normalizedPet(rawPet, index) {
    const demo = demoPets[index % demoPets.length] || demoPets[0];
    const fallback = DATA_MODE === 'demo' ? demo : {};
    return {
        ...fallback,
        id: rawPet.id || `pet-${index + 1}`,
        ...rawPet,
        name: rawPet.name || rawPet.petName || fallback.name || `Pet ${index + 1}`,
        type: rawPet.type || rawPet.petType || fallback.type || '',
        breed: rawPet.breed || fallback.breed || 'Not specified',
        gender: rawPet.gender || fallback.gender || 'Not specified',
        photo: rawPet.photoURL || rawPet.photo || rawPet.imageUrl || placeholderPhotos[index % placeholderPhotos.length],
        deviceId: rawPet.deviceId || rawPet.deviceID || fallback.deviceId || 'Not paired',
        online: rawPet.status ? rawPet.status === 'active' || rawPet.status === 'online' : true,
        battery: rawPet.battery !== null && rawPet.battery !== undefined
            ? Number(rawPet.battery)
            : fallback.battery ?? null,
        safe: rawPet.safeZoneStatus ? rawPet.safeZoneStatus !== 'outside' : true,
        geofence: rawPet.geofenceName || rawPet.safeZone?.name || fallback.geofence || 'Home',
        radius: Number(rawPet.geofenceRadius || rawPet.safeZone?.radius || fallback.radius || 100),
        activityHistoryDemo: false,
        activityHistory: Array.isArray(rawPet.activityHistory) ? rawPet.activityHistory : []
    };
}

function renderPetSelectors() {
    renderActivityPetSelector();
}

function selectPet(petId) {
    const pet = pets.find(item => item.id === petId);
    if (!pet) return;
    selectedPetId = petId;
    if (currentUser?.uid) localStorage.setItem(`lastPet_${currentUser.uid}`, petId);
    renderPetList();
    renderPetDetail();
    renderPetSelectors();
}

function renderPetList() {
    const container = $('#petList');
    if (!container) return;
    container.innerHTML = pets.map(pet => `
        <button class="management-pet-item ${pet.id === selectedPetId ? 'active' : ''}" type="button" data-pet-id="${escapeHtml(pet.id)}">
            <img src="${escapeHtml(pet.photo)}" alt="${escapeHtml(pet.name)}">
            <div><strong>${escapeHtml(pet.name)}</strong><span>${escapeHtml(pet.type)} · ${escapeHtml(pet.breed)}</span></div>
            <i class="bi bi-chevron-right"></i>
        </button>
    `).join('') || '<div class="text-center py-5 text-secondary"><i class="bi bi-person-hearts fs-3 d-block mb-2"></i>No pet profiles yet.</div>';
    $('#petCapacity').textContent = `${pets.length} of 3 profiles used.`;
    const addButton = $('#addPetBtn');
    if (addButton) {
        addButton.disabled = false;
        addButton.title = '';
    }
    if (pets.length < 3) {
        hidePetLimitWarning();
    }
}

function hidePetLimitWarning() {
    clearTimeout(petLimitWarningTimer);
    petLimitWarningTimer = null;
    const warning = $('#petLimitWarning');
    if (warning) warning.hidden = true;
}

function showPetLimitWarning() {
    const warning = $('#petLimitWarning');
    if (!warning) return;
    clearTimeout(petLimitWarningTimer);
    warning.hidden = false;
    petLimitWarningTimer = setTimeout(hidePetLimitWarning, 3000);
}

function openAddPetForm() {
    if (pets.length >= 3) {
        showPetLimitWarning();
        return;
    }
    hidePetLimitWarning();
    window.bootstrap.Modal.getOrCreateInstance($('#addPetModal')).show();
}

function renderPetDetail() {
    const container = $('#petDetail');
    if (!container) return;
    const pet = pets.find(item => item.id === selectedPetId);
    if (!pet) {
        container.innerHTML = '<div class="text-center py-5 text-secondary"><i class="bi bi-person-hearts fs-2 d-block mb-2"></i>Select or add a pet to view details.</div>';
        return;
    }
    container.innerHTML = `
        <div class="pet-profile-overview">
            <div class="pet-profile-photo-panel">
                <img class="pet-profile-portrait" src="${escapeHtml(pet.photo)}" alt="${escapeHtml(pet.name)}">
                <span class="pet-profile-photo-caption"><i class="bi bi-heart" aria-hidden="true"></i> Your companion</span>
            </div>
            <div class="pet-profile-info">
                <div class="pet-profile-heading">
                    <span class="pet-profile-kicker">PET PROFILE</span>
                    <h3>${escapeHtml(pet.name)}</h3>
                    <p>${escapeHtml(pet.type)}</p>
                </div>
                <dl class="pet-profile-details">
                    <div><dt><i class="bi bi-gender-ambiguous" aria-hidden="true"></i> Gender</dt><dd>${escapeHtml(pet.gender)}</dd></div>
                    <div><dt><i class="bi bi-person-hearts" aria-hidden="true"></i> Breed</dt><dd>${escapeHtml(pet.breed)}</dd></div>
                    <div><dt><i class="bi bi-router" aria-hidden="true"></i> Paired collar</dt><dd>${escapeHtml(pet.deviceId)}<small class="pet-profile-setting-note"><i class="bi bi-lock-fill" aria-hidden="true"></i> Read only</small></dd></div>
                    <div><dt><i class="bi bi-shield-check" aria-hidden="true"></i> Safe zone</dt><dd>${escapeHtml(pet.geofence)}<small class="pet-profile-setting-note">${pet.radius} m radius</small><button class="btn btn-soft pet-profile-setting-action" type="button" data-bs-toggle="modal" data-bs-target="#geofenceModal"><i class="bi bi-pencil" aria-hidden="true"></i> Edit geofence</button></dd></div>
                </dl>
                <div class="pet-profile-actions">
                    <button class="btn btn-brand" id="editPetPhotoBtn" type="button"><i class="bi bi-camera" aria-hidden="true"></i> Edit photo</button>
                    <button class="btn btn-danger-soft" type="button" data-delete-pet="${escapeHtml(pet.id)}" data-bs-toggle="modal" data-bs-target="#deletePetModal"><i class="bi bi-trash3" aria-hidden="true"></i> Delete profile</button>
                </div>
                <p class="pet-profile-account-note"><i class="bi bi-shield-check" aria-hidden="true"></i> A companion on your PawSense account.</p>
            </div>
        </div>
    `;
}


function renderAllPets() {
    if (!pets.some(pet => pet.id === selectedPetId)) {
        selectedPetId = pets[0]?.id || null;
    }

    setLiveTrackingPets(pets);
    renderPetSelectors();
    renderPetList();
    renderPetDetail();
    updateActivityData(getSelectedLivePetId());

    // ============================================
    // NOTIFICATIONS - REGISTERED PET PROFILES
    // ============================================

    const petList = $('#notificationsPetList');
    const petCount = $('#notificationsPetCount');

    if (petCount) {
        petCount.textContent = String(pets.length);
    }

    if (!petList) return;

    function displayNotificationPet(selectedId) {
        const selectedPet =
            pets.find(pet => pet.id === selectedId) ||
            pets[0] ||
            null;

        petList.dataset.selectedPetId = selectedPet?.id || '';

        petList.innerHTML = pets.length
            ? pets.map(pet => {
                const isSelected = pet.id === selectedPet?.id;

                const avatar = pet.photo
                    ? `<img src="${escapeHtml(pet.photo)}" alt="">`
                    : escapeHtml((pet.name || 'P').charAt(0).toUpperCase());

                return `
                    <button type="button"
                        class="notifications-pet-item ${isSelected ? 'active' : ''}"
                        data-notifications-pet-id="${escapeHtml(pet.id)}"
                        aria-pressed="${isSelected}">
                        <span class="notifications-pet-avatar">
                            ${avatar}
                        </span>
                        <span class="notifications-pet-copy">
                            <strong>${escapeHtml(pet.name)}</strong>
                            <small>${escapeHtml(pet.type || 'Registered pet')}</small>
                        </span>
                    </button>
                `;
            }).join('')
            : '<div class="notifications-empty">No registered pets available.</div>';

        const nameElement = $('#notificationsSelectedPetName');
        const infoElement = $('#notificationsSelectedPetInfo');
        const avatarElement = $('#notificationsSelectedPetAvatar');

        if (nameElement) {
            nameElement.textContent = selectedPet?.name || 'Select a pet';
        }

        if (infoElement) {
            infoElement.textContent = selectedPet
                ? selectedPet.type || 'Registered pet'
                : 'Choose a pet to view notifications.';
        }

        if (avatarElement) {
            avatarElement.innerHTML = selectedPet?.photo
                ? `<img src="${escapeHtml(selectedPet.photo)}" alt="">`
                : escapeHtml((selectedPet?.name || 'P').charAt(0).toUpperCase());
        }
    }

    petList.onclick = event => {
        const button = event.target.closest(
            '[data-notifications-pet-id]'
        );

        if (!button || !petList.contains(button)) return;

        displayNotificationPet(
            button.dataset.notificationsPetId
        );
    };

    displayNotificationPet(
        petList.dataset.selectedPetId
    );
}


function getLocallyRegisteredPets() {
    try {
        const storedPets = JSON.parse(localStorage.getItem('pets') || '[]');
        if (!Array.isArray(storedPets)) return [];
        const userEmail = currentUser?.email?.toLowerCase();
        return storedPets.filter(pet => !pet.email || String(pet.email).toLowerCase() === userEmail);
    } catch (error) {
        console.warn('Locally saved pet profiles could not be read.', error);
        return [];
    }
}

async function loadUserPets(userId) {

    // ==================================================
    // DEMO MODE
    // ==================================================

    if (DATA_MODE === 'demo') {

        console.log('DATA MODE: DEMO');

        pets = demoPets.map(
            pet => ({ ...pet })
        );

        const savedPetId =
            localStorage.getItem(
                `lastPet_${userId}`
            );

        selectedPetId =
            pets.find(
                pet => pet.id === savedPetId
            )?.id ||
            pets[0]?.id ||
            null;

        renderAllPets();

        return;
    }


    // ==================================================
    // LIVE MODE
    // ==================================================

    console.log('DATA MODE: LIVE');

    try {

        const result =
            await petService.getPets(userId);

        if (!result.success) {

            console.error(
                'Failed to load pets from Firestore:',
                result.message || result.error
            );

            pets = [];
            selectedPetId = null;

            renderAllPets();

            return;
        }

        pets = (result.pets || []).map(normalizedPet);

        console.log(
            'REAL FIRESTORE PETS:',
            pets
        );

        const savedPetId =
            localStorage.getItem(
                `lastPet_${userId}`
            );

        selectedPetId =
            pets.find(
                pet => pet.id === savedPetId
            )?.id ||
            pets[0]?.id ||
            null;

        renderAllPets();

    } catch (error) {

        console.error(
            'Unexpected error loading live pets:',
            error
        );

        pets = [];
        selectedPetId = null;

        renderAllPets();
    }
}

function getPetInitial() {

    const name =
        $('#newPetName')
            ?.value
            .trim();

    return name
        ? name.charAt(0).toUpperCase()
        : 'P';
}


function getPetInitialColor(name) {

    const colors = [
        '#DCF1EF',
        '#F8EED8',
        '#EDF5FA',
        '#FBE8E8',
        '#EAE5F5',
        '#E8F3DF'
    ];

    if (!name) {
        return colors[0];
    }

    const characterCode =
        name
            .trim()
            .toUpperCase()
            .charCodeAt(0);

    return colors[
        characterCode %
        colors.length
    ];
}


function updateNewPetInitialPreview() {

    const preview =
        $('#newPetPhotoPreview');

    const initial =
        $('#newPetInitial');

    const name =
        $('#newPetName')
            ?.value
            .trim() || '';

    if (!preview || !initial) {
        return;
    }

    initial.textContent =
        getPetInitial();

    preview.style.background =
        getPetInitialColor(name);
}


function resetNewPetPhotoPreview() {

    newPetPhotoFile = null;
    newPetPhotoData = null;

    const input =
        $('#newPetPhoto');

    const image =
        $('#newPetPhotoImage');

    const initial =
        $('#newPetInitial');

    if (input) {
        input.value = '';
    }

    if (image) {
        image.src = '';
        image.hidden = true;
    }

    if (initial) {
        initial.hidden = false;
    }

    updateNewPetInitialPreview();
}


function previewNewPetPhoto(file) {

    if (!file) {
        resetNewPetPhotoPreview();
        return;
    }

    const allowedTypes = [
        'image/jpeg',
        'image/png'
    ];

    if (!allowedTypes.includes(file.type)) {

        showToast(
            'Please select a PNG or JPG image.',
            'bi-exclamation-circle-fill'
        );

        resetNewPetPhotoPreview();

        return;
    }


    const reader =
        new FileReader();


    reader.onload = () => {

        newPetPhotoData =
            reader.result;

        const image =
            $('#newPetPhotoImage');

        const initial =
            $('#newPetInitial');

        if (image) {

            image.src =
                newPetPhotoData;

            image.hidden =
                false;
        }

        if (initial) {

            initial.hidden =
                true;
        }
    };


    reader.readAsDataURL(
        file
    );
}


function updateAddPetRadiusDisplay() {

    const radiusInput =
        $('#newGeofenceRadius');

    const radiusValue =
        $('#newGeofenceRadiusValue');

    if (!radiusInput) {
        return;
    }

    const radius =
        Number(
            radiusInput.value
        );

    if (radiusValue) {
        radiusValue.textContent =
            radius;
    }

    if (addPetSafeZoneCircle) {

        addPetSafeZoneCircle
            .setRadius(
                radius
            );
    }
}

function getLaptopLocation() {

    return new Promise((resolve, reject) => {

        if (!navigator.geolocation) {

            reject(
                new Error(
                    'Geolocation is not supported by this browser.'
                )
            );

            return;
        }


        navigator.geolocation.getCurrentPosition(

            position => {

                resolve({
                    lat:
                        position.coords.latitude,

                    lng:
                        position.coords.longitude
                });
            },

            error => {

                reject(error);
            },

            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000
            }
        );
    });
}


let safeZoneAddressConfirmed = false;

function updateSafeZoneConfirmationUI() {
    const addressText = $('#selectedSafeZoneAddressText');
    const confirmButton = $('#confirmSafeZoneAddressBtn');
    const confirmationStatus = $('#safeZoneConfirmationStatus');
    const searchInput = $('#safeZoneAddressSearch');

    const selectedAddress =
        selectedSafeZoneAddress?.formattedAddress || '';

    const validCoordinates =
        newSafeZoneCoordinates &&
        Number.isFinite(newSafeZoneCoordinates.lat) &&
        Number.isFinite(newSafeZoneCoordinates.lng);

    const addressMatches =
        searchInput?.value.trim() === selectedAddress;

    const readyToConfirm = Boolean(
        selectedAddress &&
        addressMatches &&
        validCoordinates
    );

    if (addressText) {
        addressText.textContent =
            selectedAddress || 'No address selected';
    }

    if (confirmButton) {
        confirmButton.disabled =
            !readyToConfirm || safeZoneAddressConfirmed;
    }

    if (confirmationStatus) {
        confirmationStatus.textContent =
            safeZoneAddressConfirmed && readyToConfirm
                ? 'Address confirmed. The final map pin will be used when registering your pet.'
                : readyToConfirm
                    ? 'Review the map pin, then click Confirm address.'
                    : 'Select an address from the suggestions and confirm its location on the map.';
    }
}

function setNewSafeZoneLocation(position) {

    if (!addPetMap) {
        return;
    }


    newSafeZoneCoordinates = {
        lat: Number(position.lat),
        lng: Number(position.lng)
    };


    if (!addPetSafeZoneMarker) {

        addPetSafeZoneMarker =
            new window.google.maps.Marker({
                map: addPetMap,
                position:
                    newSafeZoneCoordinates,
                draggable: true,
                title:
                    'Safe zone center'
            });


        addPetSafeZoneMarker
            .addListener(
                'dragend',
                event => {

                    setNewSafeZoneLocation({
                        lat:
                            event.latLng.lat(),

                        lng:
                            event.latLng.lng()
                    });
                }
            );

    } else {

        addPetSafeZoneMarker
            .setPosition(
                newSafeZoneCoordinates
            );
    }


    const radius =
        Number(
            $('#newGeofenceRadius')
                ?.value || 100
        );


    if (!addPetSafeZoneCircle) {

        addPetSafeZoneCircle =
            new window.google.maps.Circle({

                map:
                    addPetMap,

                center:
                    newSafeZoneCoordinates,

                radius,

                strokeColor:
                    '#1d968f',

                strokeOpacity:
                    0.8,

                strokeWeight:
                    2,

                fillColor:
                    '#1d968f',

                fillOpacity:
                    0.12
            });

    } else {

        addPetSafeZoneCircle
            .setMap(
                addPetMap
            );

        addPetSafeZoneCircle
            .setCenter(
                newSafeZoneCoordinates
            );

        addPetSafeZoneCircle
            .setRadius(
                radius
            );
    }


    addPetMap.panTo(
        newSafeZoneCoordinates
    );


    addPetMap.setZoom(
        17
    );


    const selectedLocation =
        $('#selectedSafeZoneLocation span');

    if (selectedLocation) {

        selectedLocation.textContent =
            `${newSafeZoneCoordinates.lat.toFixed(6)}, ${newSafeZoneCoordinates.lng.toFixed(6)}`;
    }
}



async function initializeAddPetSafeZoneMap() {

    const container = $('#newSafeZoneMap');

    if (!container) {
        return;
    }

    try {

    
        await loadGoogleMaps();

   

        const selectedCoordinates =
            newSafeZoneCoordinates ||
            selectedSafeZoneAddress?.coordinates ||
            null;

   

        const startingLocation = selectedCoordinates || {
            lat: 12.8797,
            lng: 121.7740
        };

        const startingZoom = selectedCoordinates ? 17 : 6;

      

        if (!addPetMap) {

            container.innerHTML = '';

            addPetMap = new window.google.maps.Map(
                container,
                {
                    center: startingLocation,
                    zoom: startingZoom,
                    mapTypeId: 'roadmap',
                    mapTypeControl: true,
                    streetViewControl: false,
                    fullscreenControl: false,
                    zoomControl: true
                }
            );

            // ============================================
            // MANUAL MAP LOCATION SELECTION
            // ============================================

            addPetMap.addListener('click', event => {

                if (!event.latLng) {
                    return;
                }

                setNewSafeZoneLocation({
                    lat: event.latLng.lat(),
                    lng: event.latLng.lng()
                });

            });

        } else {

           

            window.google.maps.event.trigger(
                addPetMap,
                'resize'
            );

            addPetMap.setCenter(
                startingLocation
            );

            addPetMap.setZoom(
                startingZoom
            );
        }

      

        if (selectedCoordinates) {

            setNewSafeZoneLocation(
                selectedCoordinates
            );

        }

    } catch (error) {

    

        console.error(
            'Unable to initialize Add Pet map:',
            error
        );

        showToast(
            'Google Maps could not be loaded.',
            'bi-exclamation-circle-fill'
        );
    }
}


function resetAddPetSafeZone() {

    newSafeZoneCoordinates = null;
    selectedSafeZoneAddress = null;
      
    safeZoneAddressConfirmed = false;
    updateSafeZoneConfirmationUI();

    const addressSearch = $('#safeZoneAddressSearch');
    const addressPanel = $('#safeZoneAddressSearchPanel');
    const addressSuggestions = $('#safeZoneAddressSuggestions');
    const addressStatus = $('#safeZoneAddressStatus');

    if (addressSearch) addressSearch.value = '';
    if (addressPanel) addressPanel.hidden = true;

    if (addressSuggestions) {
        addressSuggestions.replaceChildren();
        addressSuggestions.hidden = true;
    }

    if (addressStatus) {
        addressStatus.textContent =
            'Search for an address to locate it on the map.';
    }




    if (addPetSafeZoneMarker) {

        addPetSafeZoneMarker
            .setMap(null);

        addPetSafeZoneMarker =
            null;
    }


    if (addPetSafeZoneCircle) {

        addPetSafeZoneCircle
            .setMap(null);

        addPetSafeZoneCircle =
            null;
    }


    const selectedLocation =
        $('#selectedSafeZoneLocation span');

    if (selectedLocation) {

        selectedLocation.textContent =
            'No location selected';
    }


  
    const radius = $('#newGeofenceRadius');

    if (radius) {
        radius.value = 100;
    }

    const radiusValue = $('#newGeofenceRadiusValue');

    if (radiusValue) {
        radiusValue.textContent = '100';
    }

    // ============================================
    // RESET GOOGLE MAP FOR NEW PET REGISTRATION
    // ============================================

    const mapContainer = $('#newSafeZoneMap');
    if (mapContainer) {
    mapContainer.innerHTML = `
        <div class="add-location-empty" id="newSafeZoneEmpty">
            <span>Search and select an address above to display its location on the map.</span>
        </div>
    `;
}

    addPetMap = null;

        mapContainer.innerHTML = 
        mapContainer.querySelector('#addSafeZoneLocationBtn')
            ?.addEventListener('click', async event => {
                event.preventDefault();
                await initializeAddPetSafeZoneMap();
            });
    }





    const radiusValue =
        $('#newGeofenceRadiusValue');

    if (radiusValue) {

        radiusValue.textContent =
            '100';
    }


function attachPetManagementEvents() {

    const deletePetModalElement =
    document.getElementById(
        'deletePetModal'
    );

if (deletePetModalElement) {

    document.body.appendChild(
        deletePetModalElement
    );
}

    console.log(
    'PET MANAGEMENT EVENTS ATTACHED'
);

            $('#newPetPhoto')
        ?.addEventListener(
            'change',
            event => {

                const file =
                    event.target.files?.[0];

                if (!file) {
                    return;
                }


                if (
                    file.type !== 'image/png' &&
                    file.type !== 'image/jpeg'
                ) {

                    showToast(
                        'Please select a PNG or JPG image.',
                        'bi-exclamation-circle-fill'
                    );

                    event.target.value = '';

                    return;
                }


                if (
                    file.size >
                    2 * 1024 * 1024
                ) {

                    showToast(
                        'Pet photo must not exceed 2 MB.',
                        'bi-exclamation-circle-fill'
                    );

                    event.target.value = '';

                    return;
                }
                
                newPetPhotoFile =
                file;

                previewNewPetPhoto(
                file
                );
            }
        );

    
    // ============================================
    // CONFIRM SAFE ZONE ADDRESS
    // ============================================

    $('#confirmSafeZoneAddressBtn')?.addEventListener('click', () => {

        const selectedAddress =
            selectedSafeZoneAddress?.formattedAddress || '';

        const searchValue =
            $('#safeZoneAddressSearch')?.value.trim() || '';

        const validCoordinates =
            newSafeZoneCoordinates &&
            Number.isFinite(newSafeZoneCoordinates.lat) &&
            Number.isFinite(newSafeZoneCoordinates.lng);

        if (
            !selectedAddress ||
            searchValue !== selectedAddress ||
            !validCoordinates
        ) {
            showToast(
                'Please select a valid address and map pin.',
                'bi-exclamation-circle-fill'
            );
            return;
        }

        safeZoneAddressConfirmed = true;

        updateSafeZoneConfirmationUI();

        showToast(
            'Safe zone address confirmed successfully.',
            'bi-check-circle-fill'
        );
    });

    // ============================================
    // RESET ADD PET FORM WHEN MODAL CLOSES
    // ============================================

    $('#addPetModal')?.addEventListener('hidden.bs.modal', () => {

        // Reset all form fields
        $('#addPetForm')?.reset();

        // Reset pet photo preview
        const photoImage = $('#newPetPhotoImage');
        const petInitial = $('#newPetInitial');

        if (photoImage) {
            photoImage.removeAttribute('src');
            photoImage.hidden = true;
        }

        if (petInitial) {
            petInitial.textContent = 'P';
            petInitial.hidden = false;
        }

        // Reset address, Google Map, pin, and geofence
        resetAddPetSafeZone();

    });


$('#openSafeZoneAddressBtn')?.addEventListener('click', async () => {
    const searchPanel = $('#safeZoneAddressSearchPanel');
    const searchInput = $('#safeZoneAddressSearch');
    const searchStatus = $('#safeZoneAddressStatus');
    const suggestionsBox = $('#safeZoneAddressSuggestions');

    if (!searchPanel || !searchInput || !searchStatus || !suggestionsBox) return;

    searchPanel.hidden = false;
    searchInput.focus();

    if (searchInput.dataset.placesReady === 'true' ||
        searchInput.dataset.placesReady === 'loading') return;

    searchInput.dataset.placesReady = 'loading';
    searchStatus.textContent = 'Connecting to Google Places...';

    try {
        await loadGoogleMaps();

        const { AutocompleteSuggestion, AutocompleteSessionToken } =
            await window.google.maps.importLibrary('places');

        if (!AutocompleteSuggestion || !AutocompleteSessionToken) {
            throw new Error('Google Places Autocomplete is unavailable.');
        }

        let searchTimer = null;
        let latestRequestId = 0;
        let sessionToken = null;

        searchInput.addEventListener('input', () => {
            const query = searchInput.value.trim();
            const requestId = ++latestRequestId;

            clearTimeout(searchTimer);
            selectedSafeZoneAddress = null;
            suggestionsBox.replaceChildren();
            suggestionsBox.hidden = true;

            if (query.length < 3) {
                sessionToken = null;
                searchStatus.textContent = 'Enter at least 3 characters to search.';
                return;
            }

            if (!sessionToken) {
                sessionToken = new AutocompleteSessionToken();
            }

            searchStatus.textContent = 'Searching addresses...';

            searchTimer = setTimeout(async () => {
                try {
                    const { suggestions } =
                        await AutocompleteSuggestion.fetchAutocompleteSuggestions({
                            input: query,
                            includedRegionCodes: ['ph'],
                            sessionToken
                        });

                    if (requestId !== latestRequestId) return;

                    const predictions = suggestions
                        .map(item => item.placePrediction)
                        .filter(Boolean);

                    if (!predictions.length) {
                        searchStatus.textContent = 'No matching addresses found. Try a more specific location.';
                        return;
                    }

                    predictions.forEach(prediction => {
                        const button = document.createElement('button');

                        button.type = 'button';
                        button.className = 'btn btn-light w-100 text-start d-block border-bottom rounded-0';
                        button.setAttribute('role', 'option');
                        button.textContent = prediction.text.toString();

                        button.addEventListener('click', async () => {
                            ++latestRequestId;
                            suggestionsBox.hidden = true;
                            suggestionsBox.replaceChildren();
                            searchStatus.textContent = 'Getting selected address coordinates...';

                            try {
                                const place = prediction.toPlace();

                                await place.fetchFields({
                                    fields: ['formattedAddress', 'location']
                                });

                                if (!place.location) {
                                    throw new Error('Selected address has no coordinates.');
                                }

                                selectedSafeZoneAddress = {
                                    formattedAddress: place.formattedAddress ||
                                        prediction.text.toString(),
                                    coordinates: {
                                        lat: place.location.lat(),
                                        lng: place.location.lng()
                                    }
                                };

                                
                              searchInput.value = selectedSafeZoneAddress.formattedAddress;

                             searchStatus.textContent =
                               'Locating selected address on the map...';  
                               await initializeAddPetSafeZoneMap();

                              if (!addPetMap) {
                                  throw new Error('Google Map could not be initialized.');
                              }

                                 
                            setNewSafeZoneLocation(
                            selectedSafeZoneAddress.coordinates
                           );

                           safeZoneAddressConfirmed = false;
                            updateSafeZoneConfirmationUI();
                              searchStatus.textContent =
                                 'Pin updated based on selected address. Drag the pin to adjust if needed.';

                               sessionToken = null;

                            } catch (error) {
                                console.error('Address selection failed:', error);
                                searchStatus.textContent =
                                    'Unable to get this address location. Please try another suggestion.';
                            }
                        });

                        suggestionsBox.appendChild(button);
                    });

                    suggestionsBox.hidden = false;
                    searchStatus.textContent = 'Select the correct address from the suggestions.';

                } catch (error) {
                    if (requestId !== latestRequestId) return;

                    console.error('Google Places search failed:', error);
                    searchStatus.textContent =
                        'Address search failed. Check your Places API and billing settings.';
                }
            }, 450);
        });

        searchInput.dataset.placesReady = 'true';
        searchStatus.textContent =
            'Start typing your street, building, barangay, or city to search.';

    } catch (error) {
        searchInput.dataset.placesReady = '';
        console.error('Google Places initialization failed:', error);
        searchStatus.textContent =
            'Unable to connect to Google Places. Check the API configuration.';
    }
});



    $('#newGeofenceRadius')
        ?.addEventListener(
            'input',
            updateAddPetRadiusDisplay
        );


    $('#newPetName')
        ?.addEventListener(
            'input',
            () => {

                if (!newPetPhotoData) {

                    updateNewPetInitialPreview();
                }
            }
        );


    $('#addPetModal')
        ?.addEventListener(
            'hidden.bs.modal',
            () => {

                resetNewPetPhotoPreview();
                resetAddPetSafeZone();
            }
        );

    // ==================================================
    // OPEN ADD PET FORM
    // ==================================================

    $('#addPetBtn')?.addEventListener(
        'click',
        openAddPetForm
    );


    // ==================================================
    // PET SELECTION + DELETE TARGET
    // ==================================================

    document.addEventListener(
    'click',
    event => {

        const petTarget =
            event.target.closest(
                '[data-pet-id]'
            );

        if (petTarget) {

            selectPet(
                petTarget.dataset.petId
            );
        }


        const deleteTarget =
            event.target.closest(
                '[data-delete-pet]'
            );

        if (deleteTarget) {

            deletePetId =
                deleteTarget.dataset.deletePet;

            console.log(
                'DELETE PET SELECTED:',
                deletePetId
            );


            const deleteModal =
                document.getElementById(
                    'deletePetModal'
                );


            if (!deleteModal) {

                console.error(
                    'deletePetModal was not found.'
                );

                return;
            }


            window.bootstrap.Modal
                .getOrCreateInstance(
                    deleteModal
                )
                .show();
        }
    }
);

    // ==================================================
    // ADD PET
    // ==================================================

    $('#addPetForm')?.addEventListener(
        'submit',
        async event => {

            event.preventDefault();


            // Maximum 3 pets
            if (pets.length >= 3) {

                showPetLimitWarning();

                showToast(
                    'You can monitor up to 3 pets.',
                    'bi-exclamation-circle-fill'
                );

                return;
            }


            const index = pets.length;



if (!selectedSafeZoneAddress?.formattedAddress) {
    showToast(
        'Please select an address from the search suggestions.',
        'bi-geo-alt-fill'
    );

    $('#safeZoneAddressSearch')?.focus();
    return;
}

const searchAddressValue =
    $('#safeZoneAddressSearch')?.value.trim() || '';

if (searchAddressValue !== selectedSafeZoneAddress.formattedAddress) {
    showToast(
        'Please select a valid address from the suggestions.',
        'bi-exclamation-circle-fill'
    );

    return;
}

if (
    !newSafeZoneCoordinates ||
    !Number.isFinite(newSafeZoneCoordinates.lat) ||
    !Number.isFinite(newSafeZoneCoordinates.lng) ||
    Math.abs(newSafeZoneCoordinates.lat) > 90 ||
    Math.abs(newSafeZoneCoordinates.lng) > 180
) {
    showToast(
        'Please confirm a valid safe-zone pin on the map.',
        'bi-geo-alt-fill'
    );

    return;
}


    if (!safeZoneAddressConfirmed) {
        showToast(
            'Please confirm your selected address before adding a pet.',
            'bi-exclamation-circle-fill'
        );

        $('#confirmSafeZoneAddressBtn')?.focus();
        return;
    }


    const safeZoneName = 'Safe zone';


const safeZoneRadius =
    Number(
        $('#newGeofenceRadius')
            ?.value ||
        100
    );


// Information entered by user
const petData = {

    name:
        $('#newPetName')
            .value
            .trim(),

    type:
        $('#newPetType')
            .value,

    breed:
        $('#newPetBreed')
            .value
            .trim(),

    gender:
        $('#newPetGender')
            .value,

    deviceId:
        $('#newDeviceId')
            .value
            .trim(),

    photo:
    DATA_MODE === 'demo'
        ? placeholderPhotos[
            index %
            placeholderPhotos.length
        ]
        : null,

    status:
        'offline',

    geofenceName:
        safeZoneName,

    geofenceRadius:
        safeZoneRadius,

  
     safeZone: {
    name: safeZoneName,

    address: selectedSafeZoneAddress.formattedAddress,

    center: [
        Number(newSafeZoneCoordinates.lat),
        Number(newSafeZoneCoordinates.lng)
    ],

    radius: safeZoneRadius
}
};


            // ==================================================
            // DEMO MODE
            // ==================================================

            if (DATA_MODE === 'demo') {

                const newPet = {

                    ...demoPets[0],

                    ...petData,

                    id:
                        `prototype-${Date.now()}`,

                    battery:
                        100,

                    activity:
                        'Resting',

                    updated:
                        'Just now',

                    activityHistoryDemo:
                        false,

                    activityHistory:
                        []
                };


                pets.push(newPet);

                selectedPetId =
                    newPet.id;


                renderAllPets();


                window.bootstrap.Modal
                    .getInstance(
                        $('#addPetModal')
                    )
                    ?.hide();


                event.currentTarget.reset();


                showToast(
                    `${newPet.name} was added to the prototype.`
                );


                return;
            }


            // ==================================================
            // LIVE MODE
            // ==================================================

            if (!currentUser?.uid) {

                showToast(
                    'Unable to identify the current user.',
                    'bi-exclamation-circle-fill'
                );

                return;
            }


            try {

                const result =
                    await petService.addPet(
                        petData,
                        currentUser.uid
                    );


                if (!result.success) {

                    console.error(
                        'Failed to save pet:',
                        result.message ||
                        result.error
                    );


                    showToast(
                        'Failed to add pet.',
                        'bi-exclamation-circle-fill'
                    );


                    return;
                }


                console.log(
                    'REAL PET SAVED:',
                    result.id
                );

                                // ==========================================
                // UPLOAD PET PHOTO TO FIREBASE STORAGE
                // ==========================================

                if (newPetPhotoFile) {

                    console.log(
                        'UPLOADING PET PHOTO...'
                    );


                    const photoResult =
                        await uploadPetImage(
                            newPetPhotoFile,
                            currentUser.uid,
                            result.id
                        );


                    if (!photoResult.success) {

                        console.error(
                            'PET PHOTO UPLOAD FAILED:',
                            photoResult.error,
                            photoResult.message
                        );


                        showToast(
                            'Pet was added, but the photo could not be uploaded.',
                            'bi-exclamation-circle-fill'
                        );

                    } else {

                        console.log(
                            'PET PHOTO UPLOADED:',
                            photoResult.url
                        );


                        const photoUpdateResult =
                            await petService.updatePet(
                                result.id,
                                {
                                    photoURL:
                                        photoResult.url,

                                    photoStoragePath:
                                        photoResult.path
                                }
                            );


                        if (!photoUpdateResult.success) {

                            console.error(
                                'FAILED TO SAVE PHOTO URL:',
                                photoUpdateResult.error,
                                photoUpdateResult.message
                            );

                        } else {

                            console.log(
                                'PET PHOTO URL SAVED TO FIRESTORE'
                            );
                        }
                    }
                }


                // Reload pets directly from Firestore
                await loadUserPets(
                    currentUser.uid
                );


                // Select newly created pet
                selectedPetId =
                    result.id;


                renderAllPets();


                window.bootstrap.Modal
                    .getInstance(
                        $('#addPetModal')
                    )
                    ?.hide();


                event.currentTarget.reset();


               
showToast(
    `${petData.name} has been successfully added to PawSense!`,
    'bi-check-circle-fill'
);

            }
            catch (error) {

                console.error(
                    'Unexpected error adding pet:',
                    error
                );


                showToast(
                    'Failed to add pet.',
                    'bi-exclamation-circle-fill'
                );
            }
        }
    );


        // ==================================================
    // DELETE PET
    // ==================================================

    $('#confirmDeletePetBtn')
        ?.addEventListener(
            'click',
            async () => {

                if (!deletePetId) {
                    return;
                }


                const pet =
                    pets.find(
                        item =>
                            item.id ===
                            deletePetId
                    );


                if (!pet) {

                    showToast(
                        'Pet profile could not be found.',
                        'bi-exclamation-circle-fill'
                    );

                    return;
                }


                // ==========================================
                // DEMO MODE
                // ==========================================

                if (DATA_MODE === 'demo') {

                    pets =
                        pets.filter(
                            item =>
                                item.id !==
                                deletePetId
                        );


                    selectedPetId =
                        pets[0]?.id ||
                        null;


                    renderAllPets();


                    window.bootstrap.Modal
                        .getInstance(
                            $('#deletePetModal')
                        )
                        ?.hide();


                    showToast(
                        `${pet.name} was removed from this prototype.`,
                        'bi-trash3-fill'
                    );


                    deletePetId =
                        null;


                    return;
                }


                // ==========================================
                // LIVE MODE
                // ==========================================

                if (!currentUser?.uid) {

                    showToast(
                        'Unable to identify the current user.',
                        'bi-exclamation-circle-fill'
                    );

                    return;
                }


                const petIdToDelete =
                    deletePetId;


                try {

                    const result =
                        await petService.deletePet(
                            petIdToDelete
                        );


                    if (!result.success) {

                        console.error(
                            'Failed to delete pet from Firestore:',
                            result.message ||
                            result.error
                        );


                        showToast(
                            'Failed to delete pet.',
                            'bi-exclamation-circle-fill'
                        );


                        return;
                    }


                    console.log(
                        'PET DELETED FROM FIRESTORE:',
                        petIdToDelete
                    );


                    deletePetId =
                        null;


                    // Reload the real pet list from Firestore
                    await loadUserPets(
                        currentUser.uid
                    );


                    // Update saved selected pet
                    if (selectedPetId) {

                        localStorage.setItem(
                            `lastPet_${currentUser.uid}`,
                            selectedPetId
                        );

                    } else {

                        localStorage.removeItem(
                            `lastPet_${currentUser.uid}`
                        );
                    }


                    window.bootstrap.Modal
                        .getInstance(
                            $('#deletePetModal')
                        )
                        ?.hide();


                    showToast(
                        `${pet.name} was deleted successfully.`,
                        'bi-trash3-fill'
                    );

                } catch (error) {

                    console.error(
                        'Unexpected error deleting pet:',
                        error
                    );


                    showToast(
                        'Failed to delete pet.',
                        'bi-exclamation-circle-fill'
                    );
                }
            }
        );


    // ==================================================
    // EDIT PET PHOTO
    // ==================================================

    document.addEventListener(
        'click',
        event => {

            if (
                !event.target.closest(
                    '#editPetPhotoBtn'
                )
            ) {
                return;
            }


            const input =
                document.createElement(
                    'input'
                );


            input.type =
                'file';

            input.accept =
                'image/png,image/jpeg';


            input.addEventListener(
                'change',
                () => {

                    const file =
                        input.files[0];


                    if (!file) {
                        return;
                    }


                    const reader =
                        new FileReader();


                    reader.onload =
                        () => {

                            const pet =
                                pets.find(
                                    item =>
                                        item.id ===
                                        selectedPetId
                                );


                            if (pet) {
                                pet.photo =
                                    reader.result;
                            }


                            renderAllPets();


                            showToast(
                                'Pet photo preview updated.'
                            );
                        };


                    reader.readAsDataURL(
                        file
                    );
                }
            );


            input.click();
        }
    );


    // ==================================================
    // GEOFENCE RADIUS DISPLAY
    // ==================================================

    $('#geofenceRadius')
        ?.addEventListener(
            'input',
            event => {

                $('#radiusValue')
                    .textContent =
                    event.target.value;
            }
        );


    // ==================================================
    // SAVE GEOFENCE PREVIEW
    // ==================================================

    $('#saveGeofenceBtn')
        ?.addEventListener(
            'click',
            () => {

                const pet =
                    pets.find(
                        item =>
                            item.id ===
                            selectedPetId
                    );


                if (!pet) {
                    return;
                }


                pet.radius =
                    Number(
                        $('#geofenceRadius')
                            .value
                    );


                pet.geofence =
                    $('#geofenceName')
                        .value
                        .trim() ||
                    'Safe zone';


                renderPetDetail();


                showToast(
                    'Geofence preview updated.'
                );
            }
        );
}

export {
    renderAllPets,
    loadUserPets,
    attachPetManagementEvents
};
