// Minimal store + reducer for TSB-NG v0.1

import { uid } from "./util.js";

function reduce(state, action) {
  switch (action.type) {
    case "SELECT_TRIP":
      return { ...state, ui: { ...state.ui, selectedTripId: action.tripId } };

    case "ADD_TRIP": {
      const newTrip = {
        id: uid("TRIP"),
        client: action.trip.client,
        aircraftType: action.trip.aircraftType,
        reg: action.trip.reg,
        callsign: action.trip.callsign || "",
        tags: Array.isArray(action.trip.tags) ? action.trip.tags : [],
        notes: action.trip.notes || "",
        legs: [],
      };
      return { ...state, trips: [newTrip, ...state.trips] };
    }

    case "UPDATE_TRIP": {
      const trips = state.trips.map(t => {
        if (t.id !== action.tripId) return t;
        return { ...t, ...action.patch };
      });
      return { ...state, trips };
    }

    case "DELETE_TRIP": {
      const trips = state.trips.filter(t => t.id !== action.tripId);
      return { ...state, trips };
    }

    case "ADD_LEG": {
      const trips = state.trips.map(t => {
        if (t.id !== action.tripId) return t;
        const leg = {
          id: uid("LEG"),
          depICAO: action.leg.depICAO,
          arrICAO: action.leg.arrICAO,
          depUTC: action.leg.depUTC,
          arrUTC: action.leg.arrUTC,
        };
        return { ...t, legs: [...t.legs, leg] };
      });
      return { ...state, trips };
    }

    case "UPDATE_LEG": {
      const trips = state.trips.map(t => {
        if (t.id !== action.tripId) return t;
        const legs = t.legs.map(l => {
          if (l.id !== action.legId) return l;
          return { ...l, ...action.patch };
        });
        return { ...t, legs };
      });
      return { ...state, trips };
    }

    case "DELETE_LEG": {
      const trips = state.trips.map(t => {
        if (t.id !== action.tripId) return t;
        const legs = t.legs.filter(l => l.id !== action.legId);
        return { ...t, legs };
      });
      return { ...state, trips };
    }

    default:
      return state;
  }
}

export function createStore(initialState) {
  let state = structuredClone(initialState);
  const listeners = new Set();

  return {
    getState() { return state; },
    dispatch(action) {
      state = reduce(state, action);
      listeners.forEach(fn => fn(state));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    replaceState(nextState) {
      state = structuredClone(nextState);
      listeners.forEach(fn => fn(state));
    }
  };
}
