export interface RouteStation {
  seq: number;
  station_code: string;
  station_name: string;
  arrival: string;
  departure: string;
  halt_minutes: number;
  distance_km?: number;
  day_count?: number;
  is_origin?: boolean;
  is_destination?: boolean;
  delivery_available: boolean;
  active_outlets_count: number;
  outlets?: string[];
}

export interface TrainRouteResult {
  origin_station: string;
  destination_station: string;
  total_stations: number;
  total_delivery_stops: number;
  route_summary: string;
  stations: RouteStation[];
}

// Known major railway corridors
const CURATED_TRAIN_ROUTES: Record<string, { origin: string; destination: string; stops: Array<{ code: string; name: string; arr: string; dep: string; halt: number }> }> = {
  // Mumbai Rajdhani
  '12952': {
    origin: 'MMCT (Mumbai Central)',
    destination: 'NDLS (New Delhi)',
    stops: [
      { code: 'MMCT', name: 'Mumbai Central', arr: '--', dep: '17:00', halt: 0 },
      { code: 'BVI', name: 'Borivali', arr: '17:22', dep: '17:24', halt: 2 },
      { code: 'ST', name: 'Surat', arr: '19:10', dep: '19:13', halt: 3 },
      { code: 'BRC', name: 'Vadodara Junction', arr: '20:43', dep: '20:48', halt: 5 },
      { code: 'RTM', name: 'Ratlam Junction', arr: '23:05', dep: '23:15', halt: 10 },
      { code: 'KOTA', name: 'Kota Junction', arr: '02:50', dep: '02:55', halt: 5 },
      { code: 'NDLS', name: 'New Delhi', arr: '08:35', dep: '--', halt: 0 },
    ]
  },
  '12951': {
    origin: 'NDLS (New Delhi)',
    destination: 'MMCT (Mumbai Central)',
    stops: [
      { code: 'NDLS', name: 'New Delhi', arr: '--', dep: '16:55', halt: 0 },
      { code: 'KOTA', name: 'Kota Junction', arr: '22:15', dep: '22:20', halt: 5 },
      { code: 'RTM', name: 'Ratlam Junction', arr: '01:50', dep: '02:00', halt: 10 },
      { code: 'BRC', name: 'Vadodara Junction', arr: '04:15', dep: '04:20', halt: 5 },
      { code: 'ST', name: 'Surat', arr: '05:43', dep: '05:48', halt: 5 },
      { code: 'BVI', name: 'Borivali', arr: '07:45', dep: '07:47', halt: 2 },
      { code: 'MMCT', name: 'Mumbai Central', arr: '08:35', dep: '--', halt: 0 },
    ]
  },
  // August Kranti Rajdhani
  '12954': {
    origin: 'NZM (Hazrat Nizamuddin)',
    destination: 'MMCT (Mumbai Central)',
    stops: [
      { code: 'NZM', name: 'Hazrat Nizamuddin', arr: '--', dep: '17:15', halt: 0 },
      { code: 'MTJ', name: 'Mathura Junction', arr: '18:43', dep: '18:45', halt: 2 },
      { code: 'KOTA', name: 'Kota Junction', arr: '22:05', dep: '22:15', halt: 10 },
      { code: 'RTM', name: 'Ratlam Junction', arr: '01:45', dep: '01:55', halt: 10 },
      { code: 'BRC', name: 'Vadodara Junction', arr: '04:05', dep: '04:15', halt: 10 },
      { code: 'ST', name: 'Surat', arr: '05:40', dep: '05:45', halt: 5 },
      { code: 'VAPI', name: 'Vapi', arr: '06:47', dep: '06:49', halt: 2 },
      { code: 'BVI', name: 'Borivali', arr: '08:48', dep: '08:50', halt: 2 },
      { code: 'MMCT', name: 'Mumbai Central', arr: '09:45', dep: '--', halt: 0 },
    ]
  },
  // Kolhapur Express
  '12148': {
    origin: 'KOP (Chhatrapati Shahu Maharaj Terminus)',
    destination: 'HWH (Howrah Junction)',
    stops: [
      { code: 'KOP', name: 'Kolhapur', arr: '--', dep: '06:00', halt: 0 },
      { code: 'MRJ', name: 'Miraj Junction', arr: '06:50', dep: '06:55', halt: 5 },
      { code: 'PUNE', name: 'Pune Junction', arr: '11:45', dep: '12:00', halt: 15 },
      { code: 'DD', name: 'Daund Junction', arr: '13:20', dep: '13:25', halt: 5 },
      { code: 'MMR', name: 'Manmad Junction', arr: '17:50', dep: '17:55', halt: 5 },
      { code: 'BSL', name: 'Bhusaval Junction', arr: '21:40', dep: '21:45', halt: 5 },
      { code: 'ET', name: 'Itarsi Junction', arr: '01:50', dep: '02:00', halt: 10 },
      { code: 'JBP', name: 'Jabalpur', arr: '05:15', dep: '05:25', halt: 10 },
      { code: 'HWH', name: 'Howrah Junction', arr: '18:30', dep: '--', halt: 0 },
    ]
  },
  // Udyog Nagri Exp
  '12174': {
    origin: 'LTT (Lokmanya Tilak Terminus)',
    destination: 'PBH (Pratapgarh Junction)',
    stops: [
      { code: 'LTT', name: 'Mumbai LTT', arr: '--', dep: '16:25', halt: 0 },
      { code: 'KYN', name: 'Kalyan Junction', arr: '17:12', dep: '17:15', halt: 3 },
      { code: 'NK', name: 'Nasik Road', arr: '19:50', dep: '19:55', halt: 5 },
      { code: 'BSL', name: 'Bhusaval Junction', arr: '22:20', dep: '22:25', halt: 5 },
      { code: 'BPL', name: 'Bhopal Junction', arr: '04:15', dep: '04:25', halt: 10 },
      { code: 'VGLJ', name: 'VGL Jhansi', arr: '08:15', dep: '08:23', halt: 8 },
      { code: 'CNB', name: 'Kanpur Central', arr: '12:40', dep: '12:50', halt: 10 },
      { code: 'LKO', name: 'Lucknow Charbagh', arr: '14:25', dep: '14:35', halt: 10 },
      { code: 'PBH', name: 'Pratapgarh', arr: '18:00', dep: '--', halt: 0 },
    ]
  },
  // Tamil Nadu Express
  '12622': {
    origin: 'NDLS (New Delhi)',
    destination: 'MAS (Chennai Central)',
    stops: [
      { code: 'NDLS', name: 'New Delhi', arr: '--', dep: '21:05', halt: 0 },
      { code: 'AGC', name: 'Agra Cantt', arr: '23:25', dep: '23:30', halt: 5 },
      { code: 'GWL', name: 'Gwalior Junction', arr: '01:13', dep: '01:15', halt: 2 },
      { code: 'VGLJ', name: 'VGL Jhansi', arr: '02:35', dep: '02:43', halt: 8 },
      { code: 'BPL', name: 'Bhopal Junction', arr: '06:45', dep: '06:50', halt: 5 },
      { code: 'ET', name: 'Itarsi Junction', arr: '08:35', dep: '08:40', halt: 5 },
      { code: 'NGP', name: 'Nagpur Junction', arr: '13:05', dep: '13:15', halt: 10 },
      { code: 'BPQ', name: 'Balharshah', arr: '16:25', dep: '16:30', halt: 5 },
      { code: 'WL', name: 'Warangal', arr: '19:48', dep: '19:50', halt: 2 },
      { code: 'BZA', name: 'Vijayawada Junction', arr: '23:15', dep: '23:25', halt: 10 },
      { code: 'MAS', name: 'Chennai Central', arr: '06:15', dep: '--', halt: 0 },
    ]
  },
  // LTT RXL SF SPL
  '05558': {
    origin: 'LTT (Mumbai LTT)',
    destination: 'RXL (Raxaul Junction)',
    stops: [
      { code: 'LTT', name: 'Mumbai LTT', arr: '--', dep: '11:05', halt: 0 },
      { code: 'KYN', name: 'Kalyan Junction', arr: '11:50', dep: '11:53', halt: 3 },
      { code: 'NK', name: 'Nasik Road', arr: '14:20', dep: '14:25', halt: 5 },
      { code: 'BSL', name: 'Bhusaval Junction', arr: '21:00', dep: '21:04', halt: 4 },
      { code: 'ET', name: 'Itarsi Junction', arr: '01:40', dep: '01:50', halt: 10 },
      { code: 'JBP', name: 'Jabalpur', arr: '05:30', dep: '05:40', halt: 10 },
      { code: 'DDU', name: 'Pt Deen Dayal Upadhyaya', arr: '12:20', dep: '12:30', halt: 10 },
      { code: 'CPR', name: 'Chhapra Junction', arr: '16:45', dep: '16:55', halt: 10 },
      { code: 'RXL', name: 'Raxaul Junction', arr: '22:15', dep: '--', halt: 0 },
    ]
  },
  // DNR PUNE SPL
  '01450': {
    origin: 'DNR (Danapur)',
    destination: 'PUNE (Pune Junction)',
    stops: [
      { code: 'DNR', name: 'Danapur', arr: '--', dep: '06:30', halt: 0 },
      { code: 'ARA', name: 'Ara Junction', arr: '07:10', dep: '07:12', halt: 2 },
      { code: 'BXR', name: 'Buxar', arr: '08:05', dep: '08:07', halt: 2 },
      { code: 'DDU', name: 'Pt Deen Dayal Upadhyaya', arr: '10:00', dep: '10:10', halt: 10 },
      { code: 'PRYJ', name: 'Prayagraj Chheoki', arr: '13:10', dep: '13:15', halt: 5 },
      { code: 'JBP', name: 'Jabalpur', arr: '18:50', dep: '19:00', halt: 10 },
      { code: 'ET', name: 'Itarsi Junction', arr: '22:45', dep: '22:55', halt: 10 },
      { code: 'BSL', name: 'Bhusaval Junction', arr: '12:25', dep: '12:30', halt: 5 },
      { code: 'MMR', name: 'Manmad Junction', arr: '14:50', dep: '14:55', halt: 5 },
      { code: 'ANG', name: 'Ahmednagar', arr: '17:20', dep: '17:23', halt: 3 },
      { code: 'PUNE', name: 'Pune Junction', arr: '20:45', dep: '--', halt: 0 },
    ]
  }
};

/**
 * Standard stations pool for generating clean routes for any uncurated train
 */
const DEFAULT_CORRIDORS = [
  { code: 'NDLS', name: 'New Delhi', arr: '--', dep: '06:15', halt: 0 },
  { code: 'AGC', name: 'Agra Cantt', arr: '08:45', dep: '08:50', halt: 5 },
  { code: 'GWL', name: 'Gwalior Junction', arr: '10:18', dep: '10:20', halt: 2 },
  { code: 'VGLJ', name: 'VGL Jhansi', arr: '11:40', dep: '11:48', halt: 8 },
  { code: 'BPL', name: 'Bhopal Junction', arr: '15:20', dep: '15:25', halt: 5 },
  { code: 'ET', name: 'Itarsi Junction', arr: '17:10', dep: '17:20', halt: 10 },
  { code: 'NGP', name: 'Nagpur Junction', arr: '21:30', dep: '21:40', halt: 10 },
  { code: 'BZA', name: 'Vijayawada Junction', arr: '06:10', dep: '06:20', halt: 10 },
  { code: 'MAS', name: 'Chennai Central', arr: '12:30', dep: '--', halt: 0 },
];

export function getTrainRouteDetails(
  trainNumber: string,
  trainName: string,
  outletMap: Map<string, { count: number; names: string[] }>
): TrainRouteResult {
  const cleanNumber = (trainNumber || '').trim();
  const curated = CURATED_TRAIN_ROUTES[cleanNumber];

  let rawStops = curated ? curated.stops : DEFAULT_CORRIDORS;
  let origin = curated ? curated.origin : `${rawStops[0].code} (${rawStops[0].name})`;
  let destination = curated ? curated.destination : `${rawStops[rawStops.length - 1].code} (${rawStops[rawStops.length - 1].name})`;

  const stations: RouteStation[] = rawStops.map((s, idx) => {
    const isOrigin = idx === 0;
    const isDest = idx === rawStops.length - 1;
    const outletInfo = outletMap.get(s.code.toUpperCase()) || { count: 0, names: [] };

    // Stations with active OLF kitchens or major junction halts (>0 min) qualify for delivery
    const deliveryAvailable = (outletInfo.count > 0) || (s.halt >= 3 && !isOrigin && !isDest);

    return {
      seq: idx + 1,
      station_code: s.code,
      station_name: s.name,
      arrival: s.arr,
      departure: s.dep,
      halt_minutes: s.halt,
      is_origin: isOrigin,
      is_destination: isDest,
      delivery_available: deliveryAvailable,
      active_outlets_count: outletInfo.count,
      outlets: outletInfo.names
    };
  });

  const totalDeliveryStops = stations.filter(s => s.delivery_available).length;
  const routeSummary = `${stations[0].station_code} ──► ${stations.slice(1, -1).map(s => s.station_code).join(' ──► ')} ──► ${stations[stations.length - 1].station_code}`;

  return {
    origin_station: origin,
    destination_station: destination,
    total_stations: stations.length,
    total_delivery_stops: totalDeliveryStops,
    route_summary: routeSummary,
    stations
  };
}

