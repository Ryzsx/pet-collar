import { DATA_MODE } from '../core/data-mode.js';
import { petService } from '../services/PetService.js';
import { uploadPetImage } from '../firebase-init.js';
import { placeholderPhotos, demoPets } from './demo-data.js';
import { $, escapeHtml, showToast } from './dom.js';
import {
    renderPetAvatarSelector,
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

let geofenceMap = null;
let geofenceSafeZoneMarker = null;
let geofenceSafeZoneCircle = null;
let editedSafeZoneCoordinates = null;
let editGeofencePetId = null;
let editedGeofenceHasRadius = false;
let editedSafeZoneAddress = '';
let editedSafeZoneAddressNeedsLocation = false;

let newSafeZoneCoordinates = null;
let newSafeZoneAddress = '';
let newSafeZoneAddressNeedsLocation = false;

export function setPetManagementUser(user) {
    currentUser = user;
}

function normalizeSafeZoneCenter(center) {
    const latitude = Array.isArray(center)
        ? center[0]
        : center?.latitude ?? center?.lat;
    const longitude = Array.isArray(center)
        ? center[1]
        : center?.longitude ?? center?.lng;
    const normalizedCenter = [Number(latitude), Number(longitude)];

    return normalizedCenter.every(Number.isFinite)
        ? normalizedCenter
        : null;
}

function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function normalizedPet(rawPet, index) {
    const safeZoneName = String(rawPet.safeZone?.name ?? '').trim()
        || String(rawPet.geofenceName ?? '').trim();
    const safeZoneRadius = numberOrNull(rawPet.safeZone?.radius)
        ?? numberOrNull(rawPet.geofenceRadius);
    const safeZoneCenter = normalizeSafeZoneCenter(
        rawPet.safeZone?.center
    );

    return {
        ...rawPet,
        id: rawPet.id || `pet-${index + 1}`,
        name: rawPet.name || rawPet.petName || '',
        type: rawPet.type || rawPet.petType || '',
        breed: rawPet.breed || '',
        gender: rawPet.gender || '',
        photo: rawPet.photoURL || rawPet.photo || rawPet.imageUrl || null,
        deviceId: rawPet.deviceId || rawPet.deviceID || '',
        online: rawPet.status === 'active' || rawPet.status === 'online',
        battery: numberOrNull(rawPet.battery),
        activity: rawPet.activity ?? null,
        safe: rawPet.safeZoneStatus
            ? rawPet.safeZoneStatus !== 'outside'
            : null,
        safeZone: {
            ...(rawPet.safeZone || {}),
            name: safeZoneName,
            center: safeZoneCenter,
            radius: safeZoneRadius
        },
        geofence: safeZoneName,
        radius: safeZoneRadius,
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
            ${pet.photo ? `<img src="${escapeHtml(pet.photo)}" alt="${escapeHtml(pet.name)}">` : `<span class="management-pet-initial">${escapeHtml((pet.name || 'P').charAt(0).toUpperCase())}</span>`}
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
    const safeZoneName = pet.geofence || 'No safe zone set';
    const radiusText = Number.isFinite(pet.radius)
        ? `${pet.radius} m radius`
        : 'No radius set';
    container.innerHTML = `
        <div class="pet-profile-overview">
            <div class="pet-profile-photo-panel">
                ${pet.photo ? `<img class="pet-profile-portrait" src="${escapeHtml(pet.photo)}" alt="${escapeHtml(pet.name)}">` : `<div class="pet-profile-portrait pet-profile-initial">${escapeHtml((pet.name || 'P').charAt(0).toUpperCase())}</div>`}
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
                    <div><dt><i class="bi bi-router" aria-hidden="true"></i> Paired collar</dt><dd>${escapeHtml(pet.deviceId || 'No collar paired')}<small class="pet-profile-setting-note"><i class="bi bi-lock-fill" aria-hidden="true"></i> Read only</small></dd></div>
                    <div><dt><i class="bi bi-shield-check" aria-hidden="true"></i> Safe zone</dt><dd>${escapeHtml(safeZoneName)}<small class="pet-profile-setting-note">${escapeHtml(radiusText)}</small><button class="btn btn-soft pet-profile-setting-action" type="button" data-edit-geofence="${escapeHtml(pet.id)}"><i class="bi bi-pencil" aria-hidden="true"></i> Edit geofence</button></dd></div>
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

        pets = (result.pets || []).map(normalizedPet);

        setLiveTrackingPets(
            pets
        );

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

function setNewSafeZoneLocation(position, acceptCurrentAddress = false) {

    if (!addPetMap) {
        return;
    }


    newSafeZoneCoordinates = {
        lat: Number(position.lat),
        lng: Number(position.lng)
    };

    if (acceptCurrentAddress) {
        newSafeZoneAddress = $('#newSafeZoneAddress')?.value.trim() || '';
        newSafeZoneAddressNeedsLocation = false;
        setAddressFeedback(
            '#newSafeZoneAddressFeedback',
            'Pin updated. These marker coordinates will be saved.',
            'success'
        );
    }


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
                    }, true);
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


        const startingLocation = {
            lat: 12.8797,
            lng: 121.7740
        };


        if (!addPetMap) {

            container.innerHTML = '';


            addPetMap =
                new window.google.maps.Map(
                    container,
                    {
                        center:
                            startingLocation,

                        zoom: 6,

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
                    }, true);
                }
            );

        } else {

            window.google.maps.event.trigger(
                addPetMap,
                'resize'
            );


            addPetMap.setCenter(
                newSafeZoneCoordinates || startingLocation
            );


            addPetMap.setZoom(
                newSafeZoneCoordinates ? 17 : 6
            );
        }

        if (newSafeZoneCoordinates) {
            setNewSafeZoneLocation(newSafeZoneCoordinates);
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

function isValidMapPosition(position) {
    const latitude = Number(position?.lat);
    const longitude = Number(position?.lng);

    return Number.isFinite(latitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        Number.isFinite(longitude) &&
        longitude >= -180 &&
        longitude <= 180;
}

function setAddressFeedback(selector, message, state = '') {
    const feedback = $(selector);
    if (!feedback) return;

    feedback.textContent = message;
    feedback.className = `safe-zone-address-feedback${state ? ` ${state}` : ''}`;
}

async function geocodeSafeZoneAddress(address) {
    await loadGoogleMaps();

    return new Promise((resolve, reject) => {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ address }, (results, status) => {
            const result = results?.[0];
            if (status === 'OK' && result?.geometry?.location) {
                resolve(result);
                return;
            }

            reject(new Error(status || 'ZERO_RESULTS'));
        });
    });
}

async function findNewSafeZoneAddress() {
    const addressInput = $('#newSafeZoneAddress');
    const findButton = $('#findSafeZoneAddressBtn');
    const address = addressInput?.value.trim() || '';

    if (!address) {
        setAddressFeedback(
            '#newSafeZoneAddressFeedback',
            'Enter an address or place to search.',
            'error'
        );
        addressInput?.focus();
        return;
    }

    if (findButton) findButton.disabled = true;
    setAddressFeedback(
        '#newSafeZoneAddressFeedback',
        'Finding this location on Google Maps...'
    );

    try {
        await initializeAddPetSafeZoneMap();
        if (!addPetMap) throw new Error('MAP_UNAVAILABLE');
        const result = await geocodeSafeZoneAddress(address);
        const location = result.geometry.location;
        const formattedAddress = result.formatted_address || address;

        newSafeZoneAddress = formattedAddress;
        if (addressInput) addressInput.value = formattedAddress;
        setNewSafeZoneLocation({
            lat: location.lat(),
            lng: location.lng()
        }, true);
        setAddressFeedback(
            '#newSafeZoneAddressFeedback',
            'Location found. Click the map or drag the pin to adjust the exact center.',
            'success'
        );
    } catch (error) {
        console.warn('Safe-zone address could not be geocoded:', error);
        const message = error.message === 'ZERO_RESULTS' ||
            error.message === 'INVALID_REQUEST'
            ? 'Location not found. Try entering a more complete address.'
            : 'Address search is unavailable. Check Google Maps and try again.';
        setAddressFeedback(
            '#newSafeZoneAddressFeedback',
            message,
            'error'
        );
    } finally {
        if (findButton) findButton.disabled = false;
    }
}


function resetAddPetSafeZone() {

    newSafeZoneCoordinates =
        null;

    newSafeZoneAddress = '';
    newSafeZoneAddressNeedsLocation = false;


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

    const addressInput = $('#newSafeZoneAddress');
    if (addressInput) addressInput.value = '';

    setAddressFeedback(
        '#newSafeZoneAddressFeedback',
        'Enter an address above. PawSense will locate it on the map.'
    );
}

function getGeofenceRadius() {
    return numberOrNull(
        $('#geofenceRadius')?.value
    );
}

function updateGeofenceRadiusDisplay(hasSavedRadius = true) {
    const radius = getGeofenceRadius();
    const radiusValue = $('#radiusValue');
    editedGeofenceHasRadius = hasSavedRadius && radius !== null;

    if (radiusValue) {
        radiusValue.textContent = editedGeofenceHasRadius
            ? `${radius} m`
            : 'No radius set';
    }

    if (!editedGeofenceHasRadius && geofenceSafeZoneCircle) {
        geofenceSafeZoneCircle.setMap(null);
    } else if (geofenceSafeZoneCircle && radius !== null) {
        geofenceSafeZoneCircle.setMap(geofenceMap);
        geofenceSafeZoneCircle.setRadius(radius);
    } else if (editedGeofenceHasRadius && geofenceMap && editedSafeZoneCoordinates) {
        setEditedSafeZoneLocation(editedSafeZoneCoordinates);
    }
}

function setEditedSafeZoneLocation(
    position,
    focusMap = false,
    acceptCurrentAddress = false
) {
    if (!geofenceMap) return;

    const coordinates = {
        lat: Number(position.lat),
        lng: Number(position.lng)
    };

    if (!Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng)) {
        return;
    }

    editedSafeZoneCoordinates = coordinates;

    if (acceptCurrentAddress) {
        editedSafeZoneAddress = $('#geofenceAddress')?.value.trim() || '';
        editedSafeZoneAddressNeedsLocation = false;
        setAddressFeedback(
            '#geofenceAddressFeedback',
            'Pin updated. These marker coordinates will be saved.',
            'success'
        );
    }

    if (!geofenceSafeZoneMarker) {
        geofenceSafeZoneMarker = new window.google.maps.Marker({
            map: geofenceMap,
            position: coordinates,
            draggable: true,
            title: 'Safe zone center'
        });
        geofenceSafeZoneMarker.addListener('dragend', event => {
            setEditedSafeZoneLocation({
                lat: event.latLng.lat(),
                lng: event.latLng.lng()
            }, false, true);
        });
    } else {
        geofenceSafeZoneMarker.setMap(geofenceMap);
        geofenceSafeZoneMarker.setPosition(coordinates);
    }

    const radius = getGeofenceRadius();

    if (editedGeofenceHasRadius && radius !== null && !geofenceSafeZoneCircle) {
        geofenceSafeZoneCircle = new window.google.maps.Circle({
            map: geofenceMap,
            center: coordinates,
            radius,
            strokeColor: '#1d968f',
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: '#1d968f',
            fillOpacity: 0.12
        });
    } else if (editedGeofenceHasRadius && geofenceSafeZoneCircle) {
        geofenceSafeZoneCircle.setMap(geofenceMap);
        geofenceSafeZoneCircle.setCenter(coordinates);
        if (radius !== null) geofenceSafeZoneCircle.setRadius(radius);
    }

    if (focusMap) {
        geofenceMap.panTo(coordinates);
        geofenceMap.setZoom(17);
    }
}

async function initializeGeofenceMap(pet) {
    const container = $('#geofenceMap');
    const center = normalizeSafeZoneCenter(pet.safeZone?.center);

    geofenceMap = null;
    geofenceSafeZoneMarker = null;
    geofenceSafeZoneCircle = null;
    editedSafeZoneCoordinates = center
        ? { lat: center[0], lng: center[1] }
        : null;

    if (!container) return;

    container.innerHTML = '<div class="geofence-map-empty"><i class="bi bi-geo-alt"></i><span>Loading safe-zone map...</span></div>';

    try {
        await loadGoogleMaps();

        if (editGeofencePetId !== pet.id) return;

        container.innerHTML = '';
        geofenceMap = new window.google.maps.Map(container, {
            center: editedSafeZoneCoordinates || { lat: 12.8797, lng: 121.7740 },
            zoom: editedSafeZoneCoordinates ? 17 : 6,
            mapTypeId: 'roadmap',
            mapTypeControl: true,
            streetViewControl: false,
            fullscreenControl: false,
            zoomControl: true
        });
        geofenceMap.addListener('click', event => {
            setEditedSafeZoneLocation({
                lat: event.latLng.lat(),
                lng: event.latLng.lng()
            }, false, true);
        });
        if (editedSafeZoneCoordinates) {
            setEditedSafeZoneLocation(editedSafeZoneCoordinates);
        }
    } catch (error) {
        console.error('Unable to initialize geofence map:', error);
        container.innerHTML = '<div class="geofence-map-empty"><i class="bi bi-exclamation-circle"></i><span>Google Maps could not be loaded.</span></div>';
    }
}

async function findEditedSafeZoneAddress() {
    const pet = pets.find(item => item.id === editGeofencePetId);
    const addressInput = $('#geofenceAddress');
    const findButton = $('#findGeofenceAddressBtn');
    const address = addressInput?.value.trim() || '';

    if (!pet || !address) {
        setAddressFeedback(
            '#geofenceAddressFeedback',
            'Enter an address or place to search.',
            'error'
        );
        addressInput?.focus();
        return;
    }

    if (findButton) findButton.disabled = true;
    setAddressFeedback(
        '#geofenceAddressFeedback',
        'Finding this location on Google Maps...'
    );

    try {
        if (!geofenceMap) await initializeGeofenceMap(pet);
        if (!geofenceMap) throw new Error('MAP_UNAVAILABLE');
        const result = await geocodeSafeZoneAddress(address);
        const location = result.geometry.location;
        const formattedAddress = result.formatted_address || address;

        editedSafeZoneAddress = formattedAddress;
        if (addressInput) addressInput.value = formattedAddress;
        setEditedSafeZoneLocation({
            lat: location.lat(),
            lng: location.lng()
        }, true, true);
        setAddressFeedback(
            '#geofenceAddressFeedback',
            'Location found. Click the map or drag the pin to adjust the exact center.',
            'success'
        );
    } catch (error) {
        console.warn('Safe-zone address could not be geocoded:', error);
        const message = error.message === 'ZERO_RESULTS' ||
            error.message === 'INVALID_REQUEST'
            ? 'Location not found. Try entering a more complete address.'
            : 'Address search is unavailable. Check Google Maps and try again.';
        setAddressFeedback(
            '#geofenceAddressFeedback',
            message,
            'error'
        );
    } finally {
        if (findButton) findButton.disabled = false;
    }
}

function openGeofenceEditor(petId) {
    const pet = pets.find(item => item.id === petId);
    const modalElement = $('#geofenceModal');

    if (!pet || !modalElement) return;

    editGeofencePetId = pet.id;

    const nameInput = $('#geofenceName');
    const addressInput = $('#geofenceAddress');
    const radiusInput = $('#geofenceRadius');
    const radius = numberOrNull(pet.safeZone?.radius ?? pet.radius);
    const center = normalizeSafeZoneCenter(pet.safeZone?.center);

    editedSafeZoneCoordinates = center
        ? { lat: center[0], lng: center[1] }
        : null;
    editedSafeZoneAddress = String(pet.safeZone?.address || '').trim();
    editedSafeZoneAddressNeedsLocation = false;

    if (nameInput) {
        nameInput.value = pet.safeZone?.name || pet.geofence || '';
    }


    if (addressInput) {
        addressInput.value = editedSafeZoneAddress;
    }

    setAddressFeedback(
        '#geofenceAddressFeedback',
        center
            ? 'Search for a different address, or click and drag the pin to adjust it.'
            : 'Enter an address above. PawSense will locate it on the map.'
    );

    if (radiusInput) {
        radiusInput.min = String(radius !== null && radius > 0
            ? Math.min(50, radius)
            : 50);
        radiusInput.max = String(radius !== null
            ? Math.max(1000, radius)
            : 1000);
        radiusInput.value = String(radius ?? 100);
    }

    updateGeofenceRadiusDisplay(radius !== null);

    modalElement.addEventListener(
        'shown.bs.modal',
        () => initializeGeofenceMap(pet),
        { once: true }
    );

    window.bootstrap.Modal
        .getOrCreateInstance(modalElement)
        .show();
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
    
    $('#findSafeZoneAddressBtn')
        ?.addEventListener(
            'click',
            event => {
                event.preventDefault();
                findNewSafeZoneAddress();
            }
        );

    $('#newSafeZoneAddress')
        ?.addEventListener(
            'input',
            event => {
                const address = event.currentTarget.value.trim();
                newSafeZoneAddressNeedsLocation = Boolean(
                    address && address !== newSafeZoneAddress
                );
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
            'shown.bs.modal',
            initializeAddPetSafeZoneMap
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

        const geofenceTarget =
            event.target.closest(
                '[data-edit-geofence]'
            );

        if (geofenceTarget) {
            event.preventDefault();
            openGeofenceEditor(
                geofenceTarget.dataset.editGeofence
            );
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

        const addPetForm =
            event.currentTarget;


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


if (!isValidMapPosition(newSafeZoneCoordinates)) {

    showToast(
        'Find an address or place the safe-zone pin on the map.',
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

if (!Number.isFinite(safeZoneRadius) || safeZoneRadius <= 0) {
    showToast(
        'Enter a valid safe-zone radius.',
        'bi-exclamation-circle-fill'
    );
    return;
}

if (newSafeZoneAddressNeedsLocation) {
    showToast(
        'Find the typed address on the map or adjust the pin before saving.',
        'bi-geo-alt-fill'
    );
    return;
}

newSafeZoneAddress =
    $('#newSafeZoneAddress')?.value.trim() || '';


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

        ...(newSafeZoneAddress
            ? { address: newSafeZoneAddress }
            : {}),

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


                addPetForm.reset();


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


                addPetForm.reset();


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
            () => updateGeofenceRadiusDisplay(true)
        );


    $('#findGeofenceAddressBtn')
        ?.addEventListener(
            'click',
            event => {
                event.preventDefault();
                findEditedSafeZoneAddress();
            }
        );


    $('#geofenceAddress')
        ?.addEventListener(
            'input',
            event => {
                const address = event.currentTarget.value.trim();
                editedSafeZoneAddressNeedsLocation = Boolean(
                    address && address !== editedSafeZoneAddress
                );
            }
        );


    // ==================================================
    // SAVE GEOFENCE PREVIEW
    // ==================================================

    $('#saveGeofenceBtn')
        ?.addEventListener(
            'click',
            async event => {

                const pet =
                    pets.find(
                        item =>
                            item.id ===
                            editGeofencePetId
                    );


                if (!pet) {
                    return;
                }


                const name = $('#geofenceName')
                    .value
                    .trim();
                const radius = getGeofenceRadius();

                if (!name) {
                    showToast(
                        'Enter a safe-zone name.',
                        'bi-exclamation-circle-fill'
                    );
                    return;
                }

                if (!editedGeofenceHasRadius) {
                    showToast(
                        'Choose a safe-zone radius.',
                        'bi-exclamation-circle-fill'
                    );
                    return;
                }

                if (radius === null || radius <= 0) {
                    showToast(
                        'Enter a valid safe-zone radius.',
                        'bi-exclamation-circle-fill'
                    );
                    return;
                }

                if (!isValidMapPosition(editedSafeZoneCoordinates)) {
                    showToast(
                        'Find an address or place the safe-zone pin on the map.',
                        'bi-exclamation-circle-fill'
                    );
                    return;
                }

                if (editedSafeZoneAddressNeedsLocation) {
                    showToast(
                        'Find the typed address on the map or adjust the pin before saving.',
                        'bi-geo-alt-fill'
                    );
                    return;
                }

                editedSafeZoneAddress =
                    $('#geofenceAddress')?.value.trim() || '';

                const existingSafeZone = { ...(pet.safeZone || {}) };
                delete existingSafeZone.address;

                const safeZone = {
                    ...existingSafeZone,
                    name,
                    ...(editedSafeZoneAddress
                        ? { address: editedSafeZoneAddress }
                        : {}),
                    center: [
                        editedSafeZoneCoordinates.lat,
                        editedSafeZoneCoordinates.lng
                    ],
                    radius
                };

                const saveButton = event.currentTarget;
                saveButton.disabled = true;

                try {
                    if (DATA_MODE !== 'demo') {
                        const result = await petService.updatePet(
                            pet.id,
                            {
                                safeZone,
                                geofenceName: name,
                                geofenceRadius: radius
                            }
                        );

                        if (!result.success) {
                            console.error(
                                'Failed to update geofence in Firestore:',
                                result.message || result.error
                            );
                            showToast(
                                'Failed to save geofence.',
                                'bi-exclamation-circle-fill'
                            );
                            return;
                        }
                    }

                    pet.safeZone = safeZone;
                    pet.geofenceName = name;
                    pet.geofenceRadius = radius;
                    pet.geofence = name;
                    pet.radius = radius;

                    renderPetDetail();

                    window.bootstrap.Modal
                        .getInstance($('#geofenceModal'))
                        ?.hide();

                    showToast(
                        DATA_MODE === 'demo'
                            ? 'Geofence preview updated.'
                            : 'Geofence saved.'
                    );
                } catch (error) {
                    console.error(
                        'Unexpected error updating geofence:',
                        error
                    );
                    showToast(
                        'Failed to save geofence.',
                        'bi-exclamation-circle-fill'
                    );
                } finally {
                    saveButton.disabled = false;
                }
            }
        );
}

export {
    renderAllPets,
    loadUserPets,
    attachPetManagementEvents
};
