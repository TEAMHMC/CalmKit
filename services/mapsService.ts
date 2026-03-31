// Google Maps Directions Service for Calm Kit Walking Navigation
// Requires: Google Maps JavaScript API with Directions library

export interface WalkingRoute {
  distance: string;        // e.g., "0.8 mi"
  duration: string;        // e.g., "15 mins"
  steps: WalkingStep[];
  polyline: string;        // Encoded polyline for map display
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

export interface WalkingStep {
  instruction: string;     // "Turn left onto Main St"
  distance: string;
  duration: string;
  startLocation: { lat: number; lng: number };
  endLocation: { lat: number; lng: number };
}

export interface NearbyDestination {
  name: string;
  address: string;
  lat: number;
  lng: number;
  distance: string;
  types: string[];         // e.g., ['park', 'point_of_interest']
  rating?: number;
  photoUrl?: string;
}

// Initialize Google Maps services
let directionsService: google.maps.DirectionsService | null = null;
let placesService: google.maps.places.PlacesService | null = null;

export const initGoogleMaps = (map: google.maps.Map) => {
  directionsService = new google.maps.DirectionsService();
  placesService = new google.maps.places.PlacesService(map);
};

/**
 * Find walkable destinations near the user
 */
export const findNearbyWalkableDestinations = async (
  lat: number,
  lng: number,
  radius: number = 2000, // meters (about 1.2 miles)
  type: 'park' | 'trail' | 'any' = 'park'
): Promise<NearbyDestination[]> => {
  if (!placesService) {
    console.error('Places service not initialized');
    return [];
  }

  return new Promise((resolve) => {
    const request: google.maps.places.PlaceSearchRequest = {
      location: new google.maps.LatLng(lat, lng),
      radius,
      type: type === 'park' ? 'park' : undefined,
      keyword: type === 'trail' ? 'walking trail hiking path' : undefined,
    };

    placesService!.nearbySearch(request, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        const destinations: NearbyDestination[] = results.slice(0, 5).map((place) => ({
          name: place.name || 'Unknown',
          address: place.vicinity || '',
          lat: place.geometry?.location?.lat() || 0,
          lng: place.geometry?.location?.lng() || 0,
          distance: '', // Will be calculated
          types: place.types || [],
          rating: place.rating,
          photoUrl: place.photos?.[0]?.getUrl({ maxWidth: 400 }),
        }));
        resolve(destinations);
      } else {
        resolve([]);
      }
    });
  });
};

/**
 * Get walking directions to destination
 */
export const getWalkingDirections = async (
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<WalkingRoute | null> => {
  if (!directionsService) {
    console.error('Directions service not initialized');
    return null;
  }

  return new Promise((resolve) => {
    const request: google.maps.DirectionsRequest = {
      origin: new google.maps.LatLng(origin.lat, origin.lng),
      destination: new google.maps.LatLng(destination.lat, destination.lng),
      travelMode: google.maps.TravelMode.WALKING,
      unitSystem: google.maps.UnitSystem.IMPERIAL,
    };

    directionsService!.route(request, (result, status) => {
      if (status === google.maps.DirectionsStatus.OK && result) {
        const route = result.routes[0];
        const leg = route.legs[0];

        const walkingRoute: WalkingRoute = {
          distance: leg.distance?.text || '',
          duration: leg.duration?.text || '',
          steps: leg.steps.map((step) => ({
            instruction: step.instructions.replace(/<[^>]*>/g, ''), // Strip HTML
            distance: step.distance?.text || '',
            duration: step.duration?.text || '',
            startLocation: {
              lat: step.start_location.lat(),
              lng: step.start_location.lng(),
            },
            endLocation: {
              lat: step.end_location.lat(),
              lng: step.end_location.lng(),
            },
          })),
          polyline: route.overview_polyline,
          bounds: {
            north: route.bounds.getNorthEast().lat(),
            south: route.bounds.getSouthWest().lat(),
            east: route.bounds.getNorthEast().lng(),
            west: route.bounds.getSouthWest().lng(),
          },
        };

        resolve(walkingRoute);
      } else {
        console.error('Directions request failed:', status);
        resolve(null);
      }
    });
  });
};

/**
 * Calculate distance between two points (for display)
 */
export const calculateDistance = (
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): string => {
  const R = 3959; // Earth's radius in miles
  const dLat = toRad(destination.lat - origin.lat);
  const dLon = toRad(destination.lng - origin.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(origin.lat)) *
      Math.cos(toRad(destination.lat)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;

  return d < 0.1 ? `${Math.round(d * 5280)} ft` : `${d.toFixed(1)} mi`;
};

const toRad = (deg: number) => deg * (Math.PI / 180);

/**
 * Format turn-by-turn instruction for voice narration
 */
export const formatStepForVoice = (step: WalkingStep, lang: 'en' | 'es'): string => {
  const instruction = step.instruction;
  const distance = step.distance;

  if (lang === 'es') {
    // Basic Spanish translations for common directions
    return instruction
      .replace(/Turn left/gi, 'Gira a la izquierda')
      .replace(/Turn right/gi, 'Gira a la derecha')
      .replace(/Continue/gi, 'Continua')
      .replace(/Head/gi, 'Dirígete')
      .replace(/Walk/gi, 'Camina')
      .replace(/onto/gi, 'hacia')
      .replace(/for/gi, 'por')
      + ` por ${distance}`;
  }

  return `${instruction} for ${distance}`;
};
