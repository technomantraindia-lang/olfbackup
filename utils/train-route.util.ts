export interface RouteStation {
  seq: number;
  station_code: string;
  station_name: string;
  arrival: string;
  departure: string;
  halt_minutes: number;
  distance_km?: number;
  day_count?: number;
  station_date?: string;
  date_label?: string;
  is_upcoming?: boolean;
  is_passed?: boolean;
  can_order?: boolean;
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
  upcoming_delivery_stops?: number;
  journey_date?: string;
  route_summary: string;
  stations: RouteStation[];
}

// Known major railway corridors
const CURATED_TRAIN_ROUTES: Record<string, { origin: string; destination: string; stops: Array<{ code: string; name: string; arr: string; dep: string; halt: number; day?: number }> }> = {
  // Mumbai Rajdhani
  '12952': {
    origin: 'MMCT (Mumbai Central)',
    destination: 'NDLS (New Delhi)',
    stops: [
      { code: 'MMCT', name: 'Mumbai Central', arr: '--', dep: '17:00', halt: 0, day: 1 },
      { code: 'BVI', name: 'Borivali', arr: '17:22', dep: '17:24', halt: 2, day: 1 },
      { code: 'ST', name: 'Surat', arr: '19:10', dep: '19:13', halt: 3, day: 1 },
      { code: 'BRC', name: 'Vadodara Junction', arr: '20:43', dep: '20:48', halt: 5, day: 1 },
      { code: 'RTM', name: 'Ratlam Junction', arr: '23:05', dep: '23:15', halt: 10, day: 1 },
      { code: 'KOTA', name: 'Kota Junction', arr: '02:50', dep: '02:55', halt: 5, day: 2 },
      { code: 'NDLS', name: 'New Delhi', arr: '08:35', dep: '--', halt: 0, day: 2 },
    ]
  },
  '12951': {
    origin: 'NDLS (New Delhi)',
    destination: 'MMCT (Mumbai Central)',
    stops: [
      { code: 'NDLS', name: 'New Delhi', arr: '--', dep: '16:55', halt: 0, day: 1 },
      { code: 'KOTA', name: 'Kota Junction', arr: '22:15', dep: '22:20', halt: 5, day: 1 },
      { code: 'RTM', name: 'Ratlam Junction', arr: '01:50', dep: '02:00', halt: 10, day: 2 },
      { code: 'BRC', name: 'Vadodara Junction', arr: '04:15', dep: '04:20', halt: 5, day: 2 },
      { code: 'ST', name: 'Surat', arr: '05:43', dep: '05:48', halt: 5, day: 2 },
      { code: 'BVI', name: 'Borivali', arr: '07:45', dep: '07:47', halt: 2, day: 2 },
      { code: 'MMCT', name: 'Mumbai Central', arr: '08:35', dep: '--', halt: 0, day: 2 },
    ]
  },
  // August Kranti Rajdhani
  '12954': {
    origin: 'NZM (Hazrat Nizamuddin)',
    destination: 'MMCT (Mumbai Central)',
    stops: [
      { code: 'NZM', name: 'Hazrat Nizamuddin', arr: '--', dep: '17:15', halt: 0, day: 1 },
      { code: 'MTJ', name: 'Mathura Junction', arr: '18:43', dep: '18:45', halt: 2, day: 1 },
      { code: 'KOTA', name: 'Kota Junction', arr: '22:05', dep: '22:15', halt: 10, day: 1 },
      { code: 'RTM', name: 'Ratlam Junction', arr: '01:45', dep: '01:55', halt: 10, day: 2 },
      { code: 'BRC', name: 'Vadodara Junction', arr: '04:05', dep: '04:15', halt: 10, day: 2 },
      { code: 'ST', name: 'Surat', arr: '05:40', dep: '05:45', halt: 5, day: 2 },
      { code: 'VAPI', name: 'Vapi', arr: '06:47', dep: '06:49', halt: 2, day: 2 },
      { code: 'BVI', name: 'Borivali', arr: '08:48', dep: '08:50', halt: 2, day: 2 },
      { code: 'MMCT', name: 'Mumbai Central', arr: '09:45', dep: '--', halt: 0, day: 2 },
    ]
  },
  // Kolhapur Express
  '12148': {
    origin: 'KOP (Chhatrapati Shahu Maharaj Terminus)',
    destination: 'HWH (Howrah Junction)',
    stops: [
      { code: 'KOP', name: 'Kolhapur', arr: '--', dep: '06:00', halt: 0, day: 1 },
      { code: 'MRJ', name: 'Miraj Junction', arr: '06:50', dep: '06:55', halt: 5, day: 1 },
      { code: 'PUNE', name: 'Pune Junction', arr: '11:45', dep: '12:00', halt: 15, day: 1 },
      { code: 'DD', name: 'Daund Junction', arr: '13:20', dep: '13:25', halt: 5, day: 1 },
      { code: 'MMR', name: 'Manmad Junction', arr: '17:50', dep: '17:55', halt: 5, day: 1 },
      { code: 'BSL', name: 'Bhusaval Junction', arr: '21:40', dep: '21:45', halt: 5, day: 1 },
      { code: 'ET', name: 'Itarsi Junction', arr: '01:50', dep: '02:00', halt: 10, day: 2 },
      { code: 'JBP', name: 'Jabalpur', arr: '05:15', dep: '05:25', halt: 10, day: 2 },
      { code: 'HWH', name: 'Howrah Junction', arr: '18:30', dep: '--', halt: 0, day: 2 },
    ]
  },
  // Udyog Nagri Exp
  '12174': {
    origin: 'LTT (Lokmanya Tilak Terminus)',
    destination: 'PBH (Pratapgarh Junction)',
    stops: [
      { code: 'LTT', name: 'Mumbai LTT', arr: '--', dep: '16:25', halt: 0, day: 1 },
      { code: 'KYN', name: 'Kalyan Junction', arr: '17:12', dep: '17:15', halt: 3, day: 1 },
      { code: 'NK', name: 'Nasik Road', arr: '19:50', dep: '19:55', halt: 5, day: 1 },
      { code: 'BSL', name: 'Bhusaval Junction', arr: '22:20', dep: '22:25', halt: 5, day: 1 },
      { code: 'BPL', name: 'Bhopal Junction', arr: '04:15', dep: '04:25', halt: 10, day: 2 },
      { code: 'VGLJ', name: 'VGL Jhansi', arr: '08:15', dep: '08:23', halt: 8, day: 2 },
      { code: 'CNB', name: 'Kanpur Central', arr: '12:40', dep: '12:50', halt: 10, day: 2 },
      { code: 'LKO', name: 'Lucknow Charbagh', arr: '14:25', dep: '14:35', halt: 10, day: 2 },
      { code: 'PBH', name: 'Pratapgarh', arr: '18:00', dep: '--', halt: 0, day: 2 },
    ]
  },
  // Tamil Nadu Express (NDLS -> MAS)
  '12622': {
    origin: 'NDLS (New Delhi)',
    destination: 'MAS (Chennai Central)',
    stops: [
      { code: 'NDLS', name: 'New Delhi', arr: '--', dep: '21:05', halt: 0, day: 1 },
      { code: 'AGC', name: 'Agra Cantt', arr: '23:25', dep: '23:30', halt: 5, day: 1 },
      { code: 'GWL', name: 'Gwalior Junction', arr: '01:13', dep: '01:15', halt: 2, day: 2 },
      { code: 'VGLJ', name: 'VGL Jhansi', arr: '02:35', dep: '02:43', halt: 8, day: 2 },
      { code: 'BPL', name: 'Bhopal Junction', arr: '06:45', dep: '06:50', halt: 5, day: 2 },
      { code: 'ET', name: 'Itarsi Junction', arr: '08:35', dep: '08:40', halt: 5, day: 2 },
      { code: 'NGP', name: 'Nagpur Junction', arr: '13:05', dep: '13:15', halt: 10, day: 2 },
      { code: 'BPQ', name: 'Balharshah', arr: '16:25', dep: '16:30', halt: 5, day: 2 },
      { code: 'WL', name: 'Warangal', arr: '19:48', dep: '19:50', halt: 2, day: 2 },
      { code: 'BZA', name: 'Vijayawada Junction', arr: '23:15', dep: '23:25', halt: 10, day: 2 },
      { code: 'MAS', name: 'Chennai Central', arr: '06:15', dep: '--', halt: 0, day: 3 },
    ]
  },
  // Tamil Nadu SF Exp (MAS -> NDLS)
  '12621': {
    origin: 'MAS (Chennai Central)',
    destination: 'NDLS (New Delhi)',
    stops: [
      { code: 'MAS', name: 'Chennai Central', arr: '--', dep: '22:00', halt: 0, day: 1 },
      { code: 'BZA', name: 'Vijayawada Junction', arr: '03:55', dep: '04:05', halt: 10, day: 2 },
      { code: 'WL', name: 'Warangal', arr: '06:58', dep: '07:00', halt: 2, day: 2 },
      { code: 'BPQ', name: 'Balharshah', arr: '10:35', dep: '10:40', halt: 5, day: 2 },
      { code: 'NGP', name: 'Nagpur Junction', arr: '13:50', dep: '13:55', halt: 5, day: 2 },
      { code: 'ET', name: 'Itarsi Junction', arr: '18:30', dep: '18:35', halt: 5, day: 2 },
      { code: 'BPL', name: 'Bhopal Junction', arr: '20:10', dep: '20:20', halt: 10, day: 2 },
      { code: 'VGLJ', name: 'VGL Jhansi', arr: '00:26', dep: '00:34', halt: 8, day: 3 },
      { code: 'GWL', name: 'Gwalior Junction', arr: '01:32', dep: '01:34', halt: 2, day: 3 },
      { code: 'AGC', name: 'Agra Cantt', arr: '03:05', dep: '03:07', halt: 2, day: 3 },
      { code: 'NZM', name: 'Hazrat Nizamuddin', arr: '06:02', dep: '06:04', halt: 2, day: 3 },
      { code: 'NDLS', name: 'New Delhi', arr: '06:30', dep: '--', halt: 0, day: 3 },
    ]
  },
  // LTT GKP EXPRESS (Mumbai to Gorakhpur)
  '15017': {
    origin: 'LTT (Mumbai LTT)',
    destination: 'GKP (Gorakhpur Junction)',
    stops: [
      { code: 'LTT', name: 'Mumbai LTT', arr: '--', dep: '06:35', halt: 0, day: 1 },
      { code: 'TNA', name: 'Thane', arr: '06:58', dep: '07:00', halt: 2, day: 1 },
      { code: 'KYN', name: 'Kalyan Junction', arr: '07:17', dep: '07:20', halt: 3, day: 1 },
      { code: 'NK', name: 'Nasik Road', arr: '09:40', dep: '09:45', halt: 5, day: 1 },
      { code: 'BSL', name: 'Bhusaval Junction', arr: '13:10', dep: '13:15', halt: 5, day: 1 },
      { code: 'ET', name: 'Itarsi Junction', arr: '17:40', dep: '17:50', halt: 10, day: 1 },
      { code: 'JBP', name: 'Jabalpur', arr: '21:10', dep: '21:20', halt: 10, day: 1 },
      { code: 'KTE', name: 'Katni Junction', arr: '22:30', dep: '22:35', halt: 5, day: 1 },
      { code: 'STA', name: 'Satna Junction', arr: '00:05', dep: '00:10', halt: 5, day: 2 },
      { code: 'PRYJ', name: 'Prayagraj Junction', arr: '03:40', dep: '04:05', halt: 25, day: 2 },
      { code: 'BSB', name: 'Varanasi Junction', arr: '06:40', dep: '06:50', halt: 10, day: 2 },
      { code: 'MAU', name: 'Mau Junction', arr: '08:35', dep: '08:40', halt: 5, day: 2 },
      { code: 'DEOS', name: 'Deoria Sadar', arr: '10:10', dep: '10:15', halt: 5, day: 2 },
      { code: 'GKP', name: 'Gorakhpur Junction', arr: '11:35', dep: '--', halt: 0, day: 2 },
    ]
  },
  // KARNATAKA EXP (Bangalore to New Delhi)
  '12627': {
    origin: 'SBC (KSR Bengaluru)',
    destination: 'NDLS (New Delhi)',
    stops: [
      { code: 'SBC', name: 'KSR Bengaluru', arr: '--', dep: '19:20', halt: 0, day: 1 },
      { code: 'DMM', name: 'Dharmavaram Junction', arr: '23:08', dep: '23:10', halt: 2, day: 1 },
      { code: 'GTL', name: 'Guntakal Junction', arr: '01:05', dep: '01:10', halt: 5, day: 2 },
      { code: 'SUR', name: 'Solapur', arr: '07:20', dep: '07:25', halt: 5, day: 2 },
      { code: 'DD', name: 'Daund Junction', arr: '11:00', dep: '11:05', halt: 5, day: 2 },
      { code: 'MMR', name: 'Manmad Junction', arr: '14:30', dep: '14:35', halt: 5, day: 2 },
      { code: 'BSL', name: 'Bhusaval Junction', arr: '16:45', dep: '16:50', halt: 5, day: 2 },
      { code: 'BPL', name: 'Bhopal Junction', arr: '21:30', dep: '21:40', halt: 10, day: 2 },
      { code: 'VGLJ', name: 'VGL Jhansi', arr: '02:40', dep: '02:48', halt: 8, day: 3 },
      { code: 'GWL', name: 'Gwalior Junction', arr: '04:00', dep: '04:02', halt: 2, day: 3 },
      { code: 'AGC', name: 'Agra Cantt', arr: '05:45', dep: '05:50', halt: 5, day: 3 },
      { code: 'NDLS', name: 'New Delhi', arr: '09:00', dep: '--', halt: 0, day: 3 },
    ]
  },
  // JBP NZM SF EXP (Jabalpur to Nizamuddin)
  '12192': {
    origin: 'JBP (Jabalpur)',
    destination: 'NZM (Hazrat Nizamuddin)',
    stops: [
      { code: 'JBP', name: 'Jabalpur', arr: '--', dep: '17:45', halt: 0, day: 1 },
      { code: 'PPI', name: 'Pipariya', arr: '19:53', dep: '19:55', halt: 2, day: 1 },
      { code: 'ET', name: 'Itarsi Junction', arr: '21:20', dep: '21:30', halt: 10, day: 1 },
      { code: 'BPL', name: 'Bhopal Junction', arr: '23:30', dep: '23:35', halt: 5, day: 1 },
      { code: 'BINA', name: 'Bina Junction', arr: '01:30', dep: '01:35', halt: 5, day: 2 },
      { code: 'VGLJ', name: 'VGL Jhansi', arr: '04:15', dep: '04:23', halt: 8, day: 2 },
      { code: 'GWL', name: 'Gwalior Junction', arr: '05:35', dep: '05:37', halt: 2, day: 2 },
      { code: 'AGC', name: 'Agra Cantt', arr: '07:25', dep: '07:30', halt: 5, day: 2 },
      { code: 'MTJ', name: 'Mathura Junction', arr: '08:08', dep: '08:10', halt: 2, day: 2 },
      { code: 'NZM', name: 'Hazrat Nizamuddin', arr: '11:55', dep: '--', halt: 0, day: 2 },
    ]
  },
  // SANGHAMITRA EXP (Bengaluru to Danapur)
  '12295': {
    origin: 'SMVB (SMVT Bengaluru)',
    destination: 'DNR (Danapur)',
    stops: [
      { code: 'SMVB', name: 'SMVT Bengaluru', arr: '--', dep: '09:15', halt: 0, day: 1 },
      { code: 'KPD', name: 'Katpadi Junction', arr: '12:45', dep: '12:50', halt: 5, day: 1 },
      { code: 'PER', name: 'Perambur (Chennai)', arr: '14:40', dep: '14:45', halt: 5, day: 1 },
      { code: 'OGL', name: 'Ongole', arr: '19:08', dep: '19:10', halt: 2, day: 1 },
      { code: 'BZA', name: 'Vijayawada Junction', arr: '21:50', dep: '22:00', halt: 10, day: 1 },
      { code: 'WL', name: 'Warangal', arr: '01:03', dep: '01:05', halt: 2, day: 2 },
      { code: 'BPQ', name: 'Balharshah', arr: '05:25', dep: '05:30', halt: 5, day: 2 },
      { code: 'NGP', name: 'Nagpur Junction', arr: '08:35', dep: '08:40', halt: 5, day: 2 },
      { code: 'ET', name: 'Itarsi Junction', arr: '13:35', dep: '13:45', halt: 10, day: 2 },
      { code: 'JBP', name: 'Jabalpur', arr: '17:15', dep: '17:25', halt: 10, day: 2 },
      { code: 'KTE', name: 'Katni Junction', arr: '18:40', dep: '18:45', halt: 5, day: 2 },
      { code: 'STA', name: 'Satna Junction', arr: '20:10', dep: '20:15', halt: 5, day: 2 },
      { code: 'PCOI', name: 'Prayagraj Chheoki', arr: '23:40', dep: '23:45', halt: 5, day: 2 },
      { code: 'DDU', name: 'Pt Deen Dayal Upadhyaya', arr: '04:05', dep: '04:15', halt: 10, day: 3 },
      { code: 'BXR', name: 'Buxar', arr: '05:20', dep: '05:22', halt: 2, day: 3 },
      { code: 'ARA', name: 'Ara Junction', arr: '06:13', dep: '06:15', halt: 2, day: 3 },
      { code: 'DNR', name: 'Danapur', arr: '07:40', dep: '--', halt: 0, day: 3 },
    ]
  },
  // SANGHA MITRA EX (Danapur to Bengaluru)
  '12296': {
    origin: 'DNR (Danapur)',
    destination: 'SMVB (SMVT Bengaluru)',
    stops: [
      { code: 'DNR', name: 'Danapur', arr: '--', dep: '20:15', halt: 0, day: 1 },
      { code: 'ARA', name: 'Ara Junction', arr: '20:53', dep: '20:55', halt: 2, day: 1 },
      { code: 'BXR', name: 'Buxar', arr: '21:40', dep: '21:42', halt: 2, day: 1 },
      { code: 'DDU', name: 'Pt Deen Dayal Upadhyaya', arr: '23:15', dep: '23:25', halt: 10, day: 1 },
      { code: 'PCOI', name: 'Prayagraj Chheoki', arr: '01:40', dep: '01:45', halt: 5, day: 2 },
      { code: 'STA', name: 'Satna Junction', arr: '04:45', dep: '04:50', halt: 5, day: 2 },
      { code: 'KTE', name: 'Katni Junction', arr: '06:10', dep: '06:15', halt: 5, day: 2 },
      { code: 'JBP', name: 'Jabalpur', arr: '07:40', dep: '07:50', halt: 10, day: 2 },
      { code: 'ET', name: 'Itarsi Junction', arr: '11:40', dep: '11:50', halt: 10, day: 2 },
      { code: 'NGP', name: 'Nagpur Junction', arr: '16:20', dep: '16:25', halt: 5, day: 2 },
      { code: 'BPQ', name: 'Balharshah', arr: '19:40', dep: '19:45', halt: 5, day: 2 },
      { code: 'WL', name: 'Warangal', arr: '23:20', dep: '23:22', halt: 2, day: 2 },
      { code: 'BZA', name: 'Vijayawada Junction', arr: '02:55', dep: '03:05', halt: 10, day: 3 },
      { code: 'OGL', name: 'Ongole', arr: '04:58', dep: '05:00', halt: 2, day: 3 },
      { code: 'PER', name: 'Perambur (Chennai)', arr: '09:40', dep: '09:45', halt: 5, day: 3 },
      { code: 'KPD', name: 'Katpadi Junction', arr: '11:45', dep: '11:50', halt: 5, day: 3 },
      { code: 'SMVB', name: 'SMVT Bengaluru', arr: '16:10', dep: '--', halt: 0, day: 3 },
    ]
  },
  // MAHANAGARI EXP (Mumbai to Varanasi)
  '22177': {
    origin: 'CSMT (Mumbai CSMT)',
    destination: 'BSB (Varanasi Junction)',
    stops: [
      { code: 'CSMT', name: 'Mumbai CSMT', arr: '--', dep: '00:10', halt: 0, day: 1 },
      { code: 'DR', name: 'Dadar Central', arr: '00:22', dep: '00:25', halt: 3, day: 1 },
      { code: 'TNA', name: 'Thane', arr: '00:42', dep: '00:45', halt: 3, day: 1 },
      { code: 'KYN', name: 'Kalyan Junction', arr: '01:02', dep: '01:05', halt: 3, day: 1 },
      { code: 'NK', name: 'Nasik Road', arr: '03:30', dep: '03:35', halt: 5, day: 1 },
      { code: 'MMR', name: 'Manmad Junction', arr: '04:28', dep: '04:30', halt: 2, day: 1 },
      { code: 'BSL', name: 'Bhusaval Junction', arr: '07:00', dep: '07:05', halt: 5, day: 1 },
      { code: 'ET', name: 'Itarsi Junction', arr: '11:40', dep: '11:50', halt: 10, day: 1 },
      { code: 'JBP', name: 'Jabalpur', arr: '15:20', dep: '15:30', halt: 10, day: 1 },
      { code: 'KTE', name: 'Katni Junction', arr: '16:45', dep: '16:50', halt: 5, day: 1 },
      { code: 'STA', name: 'Satna Junction', arr: '18:15', dep: '18:20', halt: 5, day: 1 },
      { code: 'MKP', name: 'Manikpur Junction', arr: '19:48', dep: '19:50', halt: 2, day: 1 },
      { code: 'PRYJ', name: 'Prayagraj Junction', arr: '22:20', dep: '22:50', halt: 30, day: 1 },
      { code: 'BSB', name: 'Varanasi Junction', arr: '01:25', dep: '--', halt: 0, day: 2 },
    ]
  },
  // LTT RXL SF SPL
  '05558': {
    origin: 'LTT (Mumbai LTT)',
    destination: 'RXL (Raxaul Junction)',
    stops: [
      { code: 'LTT', name: 'Mumbai LTT', arr: '--', dep: '11:05', halt: 0, day: 1 },
      { code: 'KYN', name: 'Kalyan Junction', arr: '11:50', dep: '11:53', halt: 3, day: 1 },
      { code: 'NK', name: 'Nasik Road', arr: '14:20', dep: '14:25', halt: 5, day: 1 },
      { code: 'BSL', name: 'Bhusaval Junction', arr: '21:00', dep: '21:04', halt: 4, day: 1 },
      { code: 'ET', name: 'Itarsi Junction', arr: '01:40', dep: '01:50', halt: 10, day: 2 },
      { code: 'JBP', name: 'Jabalpur', arr: '05:30', dep: '05:40', halt: 10, day: 2 },
      { code: 'DDU', name: 'Pt Deen Dayal Upadhyaya', arr: '12:20', dep: '12:30', halt: 10, day: 2 },
      { code: 'CPR', name: 'Chhapra Junction', arr: '16:45', dep: '16:55', halt: 10, day: 2 },
      { code: 'RXL', name: 'Raxaul Junction', arr: '22:15', dep: '--', halt: 0, day: 2 },
    ]
  },
  // DNR PUNE SPL
  '01450': {
    origin: 'DNR (Danapur)',
    destination: 'PUNE (Pune Junction)',
    stops: [
      { code: 'DNR', name: 'Danapur', arr: '--', dep: '06:30', halt: 0, day: 1 },
      { code: 'ARA', name: 'Ara Junction', arr: '07:10', dep: '07:12', halt: 2, day: 1 },
      { code: 'BXR', name: 'Buxar', arr: '08:05', dep: '08:07', halt: 2, day: 1 },
      { code: 'DDU', name: 'Pt Deen Dayal Upadhyaya', arr: '10:00', dep: '10:10', halt: 10, day: 1 },
      { code: 'PRYJ', name: 'Prayagraj Chheoki', arr: '13:10', dep: '13:15', halt: 5, day: 1 },
      { code: 'JBP', name: 'Jabalpur', arr: '18:50', dep: '19:00', halt: 10, day: 1 },
      { code: 'ET', name: 'Itarsi Junction', arr: '22:45', dep: '22:55', halt: 10, day: 1 },
      { code: 'BSL', name: 'Bhusaval Junction', arr: '03:25', dep: '03:30', halt: 5, day: 2 },
      { code: 'MMR', name: 'Manmad Junction', arr: '05:50', dep: '05:55', halt: 5, day: 2 },
      { code: 'ANG', name: 'Ahmednagar', arr: '08:20', dep: '08:23', halt: 3, day: 2 },
      { code: 'PUNE', name: 'Pune Junction', arr: '11:45', dep: '--', halt: 0, day: 2 },
    ]
  }
};

/**
 * Standard stations pool for generating clean routes for any uncurated train
 */
const DEFAULT_CORRIDORS = [
  { code: 'NDLS', name: 'New Delhi', arr: '--', dep: '06:15', halt: 0, day: 1 },
  { code: 'AGC', name: 'Agra Cantt', arr: '08:45', dep: '08:50', halt: 5, day: 1 },
  { code: 'GWL', name: 'Gwalior Junction', arr: '10:18', dep: '10:20', halt: 2, day: 1 },
  { code: 'VGLJ', name: 'VGL Jhansi', arr: '11:40', dep: '11:48', halt: 8, day: 1 },
  { code: 'BPL', name: 'Bhopal Junction', arr: '15:20', dep: '15:25', halt: 5, day: 1 },
  { code: 'ET', name: 'Itarsi Junction', arr: '17:10', dep: '17:20', halt: 10, day: 1 },
  { code: 'NGP', name: 'Nagpur Junction', arr: '21:30', dep: '21:40', halt: 10, day: 1 },
  { code: 'BZA', name: 'Vijayawada Junction', arr: '06:10', dep: '06:20', halt: 10, day: 2 },
  { code: 'MAS', name: 'Chennai Central', arr: '12:30', dep: '--', halt: 0, day: 2 },
];

export function getTrainRouteDetails(
  trainNumber: string,
  trainName: string,
  outletMap: Map<string, { count: number; names: string[] }>,
  journeyDateStr?: string
): TrainRouteResult {
  const cleanNumber = (trainNumber || '').trim();
  const curated = CURATED_TRAIN_ROUTES[cleanNumber];

  let rawStops = curated ? curated.stops : DEFAULT_CORRIDORS;
  let origin = curated ? curated.origin : `${rawStops[0].code} (${rawStops[0].name})`;
  let destination = curated ? curated.destination : `${rawStops[rawStops.length - 1].code} (${rawStops[rawStops.length - 1].name})`;

  // Determine base journey date (defaults to today in Asia/Kolkata)
  const now = new Date();
  const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
  const baseDateStr = (journeyDateStr && /^\d{4}-\d{2}-\d{2}$/.test(journeyDateStr.trim())) ? journeyDateStr.trim() : todayIST;
  const [baseY, baseM, baseD] = baseDateStr.split('-').map(Number);

  let currentDay = 1;
  let previousTimeStr = '00:00';

  const stations: RouteStation[] = rawStops.map((s, idx) => {
    const isOrigin = idx === 0;
    const isDest = idx === rawStops.length - 1;
    const outletInfo = outletMap.get(s.code.toUpperCase()) || { count: 0, names: [] };

    // Stations with active OLF kitchens or major junction halts (>0 min) qualify for delivery
    const deliveryAvailable = (outletInfo.count > 0) || (s.halt >= 3 && !isOrigin && !isDest);

    // Compute Day Count and Date
    const arrivalTime = s.arr !== '--' ? s.arr : s.dep;
    const departureTime = s.dep !== '--' ? s.dep : s.arr;

    if (s.day) {
      currentDay = s.day;
    } else {
      if (idx > 0 && arrivalTime < previousTimeStr) {
        currentDay++;
      }
    }
    previousTimeStr = departureTime;

    // Station calendar date
    const stationDateObj = new Date(Date.UTC(baseY, baseM - 1, baseD + (currentDay - 1)));
    const stationDateStr = stationDateObj.toISOString().slice(0, 10);

    // Station date label
    const isToday = stationDateStr === todayIST;
    const dateFormatted = stationDateObj.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC'
    });
    const dateLabel = isToday ? `Today (${dateFormatted})` : `Day ${currentDay} • ${dateFormatted}`;

    // Delivery cutoff calculation: 30 minutes before arrival (or departure if origin)
    const targetTimeStr = (s.arr !== '--' ? s.arr : s.dep) || '12:00';
    const scheduledStopTs = new Date(`${stationDateStr}T${targetTimeStr}:00+05:30`).getTime();
    const cutoffBufferMs = 30 * 60 * 1000;
    const currentTs = now.getTime();

    // An upcoming station has scheduled arrival in the future beyond the 30-min preparation buffer
    const isUpcoming = (scheduledStopTs - currentTs) >= cutoffBufferMs;
    const isPassed = !isUpcoming;
    const canOrder = deliveryAvailable && isUpcoming;

    return {
      seq: idx + 1,
      station_code: s.code,
      station_name: s.name,
      arrival: s.arr,
      departure: s.dep,
      halt_minutes: s.halt,
      day_count: currentDay,
      station_date: stationDateStr,
      date_label: dateLabel,
      is_upcoming: isUpcoming,
      is_passed: isPassed,
      can_order: canOrder,
      is_origin: isOrigin,
      is_destination: isDest,
      delivery_available: deliveryAvailable,
      active_outlets_count: outletInfo.count,
      outlets: outletInfo.names
    };
  });

  const totalDeliveryStops = stations.filter(s => s.delivery_available).length;
  const upcomingDeliveryStops = stations.filter(s => s.can_order).length;
  const routeSummary = `${stations[0].station_code} ──► ${stations.slice(1, -1).map(s => s.station_code).join(' ──► ')} ──► ${stations[stations.length - 1].station_code}`;

  return {
    origin_station: origin,
    destination_station: destination,
    total_stations: stations.length,
    total_delivery_stops: totalDeliveryStops,
    upcoming_delivery_stops: upcomingDeliveryStops,
    journey_date: baseDateStr,
    route_summary: routeSummary,
    stations
  };
}
