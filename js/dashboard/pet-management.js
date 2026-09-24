import { DATA_MODE } from '../core/data-mode.js';
import { petService } from '../services/PetService.js';
import { uploadPetImage } from '../firebase-init.js';
import { placeholderPhotos, demoPets } from './demo-data.js';
import { $, escapeHtml, showToast } from './dom.js';
import {
    renderPetAvatarSelector,
    renderActivityPetSelector,
    getSelectedLivePetId,
    loadGoogleMaps
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

export function setPetManagementUser(user) {
    currentUser = user;
}

function normalizedPet(rawPet, index) {
    const demo = demoPets[index % demoPets.length] || demoPets[0];
    return {
        ...demo,
        id: rawPet.id || `pet-${index + 1}`,
        name: rawPet.name || rawPet.petName || demo.name,
        type: rawPet.type || rawPet.petType || demo.type,
        breed: rawPet.breed || demo.breed,
        gender: rawPet.gender || demo.gender,
        photo: rawPet.photoURL || rawPet.photo || rawPet.imageUrl || placeholderPhotos[index % placeholderPhotos.length],
        deviceId: rawPet.deviceId || rawPet.deviceID || `SC-2026-${String(3100 + index).padStart(4, '0')}`,
        online: rawPet.status ? rawPet.status === 'active' || rawPet.status === 'online' : true,
        battery: Number(rawPet.battery ?? demo.battery),
        safe: rawPet.safeZoneStatus ? rawPet.safeZoneStatus !== 'outside' : true,
        geofence: rawPet.geofenceName || demo.geofence,
        radius: Number(rawPet.geofenceRadius || demo.radius),
        activityHistoryDemo: false,
        activityHistory: Array.isArray(rawPet.activityHistory) ? rawPet.activityHistory : []
    };
}

function renderPetSelectors() {
    renderPetAvatarSelector('#historyPetSelect', pets, selectedPetId, petId => selectPet(petId), pet => (pet.online ? 'online' : 'offline'));
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
    if (!pets.some(pet => pet.id === selectedPetId)) selectedPetId = pets[0]?.id || null;
    renderPetSelectors();
    renderPetList();
    renderPetDetail();
    updateActivityData(getSelectedLivePetId());
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

        pets = result.pets || [];

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

    const container =
        $('#newSafeZoneMap');

    if (!container) {
        return;
    }


    try {

        await loadGoogleMaps();


        let startingLocation = {
            lat: 12.8797,
            lng: 121.7740
        };


        try {

            startingLocation =
                await getLaptopLocation();

        } catch (locationError) {

            console.warn(
                'Laptop location unavailable:',
                locationError
            );

            showToast(
                'Current location unavailable. Select the location manually on the map.',
                'bi-geo-alt'
            );
        }


        if (!addPetMap) {

            container.innerHTML = '';


            addPetMap =
                new window.google.maps.Map(
                    container,
                    {
                        center:
                            startingLocation,

                        zoom: 17,

                        mapTypeId:
                            'roadmap',

                        mapTypeControl:
                            true,

                        streetViewControl:
                            false,

                        fullscreenControl:
                            false,

                        zoomControl:
                            true
                    }
                );


            addPetMap.addListener(
                'click',
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

            window.google.maps.event.trigger(
                addPetMap,
                'resize'
            );


            addPetMap.setCenter(
                startingLocation
            );


            addPetMap.setZoom(
                17
            );
        }


        setNewSafeZoneLocation(
            startingLocation
        );


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

    newSafeZoneCoordinates =
        null;


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


    const radius =
        $('#newGeofenceRadius');

    if (radius) {

        radius.value =
            100;
    }


    const radiusValue =
        $('#newGeofenceRadiusValue');

    if (radiusValue) {

        radiusValue.textContent =
            '100';
    }
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

console.log(
    'ADD LOCATION BUTTON:',
    document.getElementById(
        'addSafeZoneLocationBtn'
    )
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
    
                $('#addSafeZoneLocationBtn')
        ?.addEventListener(
            'click',
            async event => {

                event.preventDefault();

                console.log(
                    'ADD LOCATION CLICKED'
                );

                await initializeAddPetSafeZoneMap();
            }
        );


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


if (!newSafeZoneCoordinates) {

    showToast(
        'Please select a safe-zone location.',
        'bi-geo-alt-fill'
    );

    return;
}


const safeZoneName =
    $('#newSafeZoneLabel')
        ?.value
        .trim() ||
    'Home';


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

        name:
            safeZoneName,

        center: [
            Number(
                newSafeZoneCoordinates.lat
            ),

            Number(
                newSafeZoneCoordinates.lng
            )
        ],

        radius:
            safeZoneRadius
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
                    `${petData.name} was added successfully.`
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
