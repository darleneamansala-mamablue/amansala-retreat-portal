// ===== demo-seed.js — extracted from booking-hub.html =====
// Loaded as a classic script; shares global scope with booking-hub.html (same pattern as cb-portal-sync.js).
// Do not add <script type="module"> here — onclick="..." handlers in the HTML rely on plain globals.

// ===== SEED DEMO =====
function seedDemo(){
  // Demo data removed — portal starts clean
}


// ===== FILL SAMPLE RETREATS =====
function fillSampleRetreats(){
  if(!confirm('Load sample retreat data for 2026–2027?\n\nPrevious sample data will be replaced. Any booking with room assignments will be kept.'))return;
  // Remove old sample entries (those flagged or with no room assignments that match sample leader names)
  AppData.bookings=AppData.bookings.filter(b=>!(b._isSample===true));

  // Key: room_list_sent retreats are STRAIGHT-LINED (endDate of prev = startDate of next).
  // deposit_paid → ~7 day gap · contract_sent → ~14 day gap · requested → ~14–21 day gap
  const sample=[

    // ════════════════════════════════════════
    //  RETREAT 1  ·  May 2026 → April 2027
    // ════════════════════════════════════════
    // May — straight-line pair
    {row:'RETREAT 1',leaderName:'Anna Martinez',  retreatName:'Yoga & Flow Immersion', startDate:'2026-05-10',endDate:'2026-05-17',pax:14,status:'room_list_sent'},
    {row:'RETREAT 1',leaderName:'Carlos Mendez',  retreatName:'Surf & Breathwork',     startDate:'2026-05-17',endDate:'2026-05-24',pax:12,status:'room_list_sent'},
    // Jun — deposit_paid  (14-day gap after May 24)
    {row:'RETREAT 1',leaderName:'Lisa Chen',      retreatName:'Sacred Feminine',       startDate:'2026-06-07',endDate:'2026-06-14',pax:10,status:'deposit_paid'},
    // Jul — deposit_paid  (14-day gap)
    {row:'RETREAT 1',leaderName:'James Porter',   retreatName:'Vinyasa Deep Dive',     startDate:'2026-06-28',endDate:'2026-07-05',pax:16,status:'deposit_paid'},
    // Jul-Aug — contract_signed  (14-day gap)
    {row:'RETREAT 1',leaderName:'Sofia Reyes',    retreatName:'Yin & Restore',         startDate:'2026-07-19',endDate:'2026-07-26',pax:11,status:'contract_signed'},
    // Aug — contract_signed  (20-day gap)
    {row:'RETREAT 1',leaderName:'Priya Sharma',   retreatName:'Ayurvedic Yoga Week',   startDate:'2026-08-15',endDate:'2026-08-22',pax:14,status:'contract_signed'},
    // Sep — contract_sent  (14-day gap)
    {row:'RETREAT 1',leaderName:'Emma Wilson',    retreatName:'Fall Flow Retreat',     startDate:'2026-09-05',endDate:'2026-09-12',pax:10,status:'contract_sent'},
    // Sep-Oct — contract_sent  (14-day gap) → feeds straight-line chain below
    {row:'RETREAT 1',leaderName:'Victor Ruiz',    retreatName:'Tulum Detox',           startDate:'2026-09-26',endDate:'2026-10-03',pax:9, status:'contract_sent'},
    // Oct — straight-line triple  ↔↔
    {row:'RETREAT 1',leaderName:'Kayla Stern',    retreatName:'Power Flow',            startDate:'2026-10-03',endDate:'2026-10-10',pax:12,status:'room_list_sent'},
    {row:'RETREAT 1',leaderName:'Nathan Cruz',    retreatName:'Deep Stretch',          startDate:'2026-10-10',endDate:'2026-10-17',pax:10,status:'room_list_sent'},
    {row:'RETREAT 1',leaderName:'Valentina Ross', retreatName:'Mindful Movement',      startDate:'2026-10-17',endDate:'2026-10-24',pax:13,status:'room_list_sent'},
    // Nov — deposit_paid  (14-day gap)
    {row:'RETREAT 1',leaderName:'Diana Lake',     retreatName:'Autumn Balance',        startDate:'2026-11-07',endDate:'2026-11-14',pax:11,status:'deposit_paid'},
    // Nov-Dec — contract_sent  (14-day gap)
    {row:'RETREAT 1',leaderName:'Finn Harper',    retreatName:'Sunset Wellness',       startDate:'2026-11-28',endDate:'2026-12-05',pax:12,status:'contract_sent'},
    // Dec — requested  (14-day gap)
    {row:'RETREAT 1',leaderName:'Lena Wood',      retreatName:'Holiday Reset',         startDate:'2026-12-19',endDate:'2026-12-26',pax:10,status:'requested'},
    // Jan 2027 — contract_signed  (13-day gap)
    {row:'RETREAT 1',leaderName:'Anna Martinez',  retreatName:'New Year Flow',         startDate:'2027-01-08',endDate:'2027-01-15',pax:16,status:'contract_signed'},
    // Straight-line into Megan Aaron (existing seed Jan 21-28)
    {row:'RETREAT 1',leaderName:'Bianca Stone',   retreatName:'Heart Space',           startDate:'2027-01-15',endDate:'2027-01-21',pax:9, status:'room_list_sent'},
    // [Megan Aaron Jan 21-28 straight-lines in — existing seed]
    // Feb — deposit_paid  (7-day gap after Megan ends Jan 28)
    {row:'RETREAT 1',leaderName:'Jackson Reed',   retreatName:'Sacred Geometry',       startDate:'2027-02-04',endDate:'2027-02-11',pax:11,status:'deposit_paid'},
    // Straight-line into Kate Fowler (existing seed Feb 18-25)
    {row:'RETREAT 1',leaderName:'Cassie North',   retreatName:'Heart Chakra Open',     startDate:'2027-02-11',endDate:'2027-02-18',pax:10,status:'room_list_sent'},
    // [Kate Fowler Feb 18-25 straight-lines in — existing seed]
    // Mar — contract_sent  (14-day gap after Kate ends Feb 25)
    {row:'RETREAT 1',leaderName:'Sofia Kim',      retreatName:'Spring Balance',        startDate:'2027-03-11',endDate:'2027-03-18',pax:12,status:'contract_sent'},
    // Mar — requested  (7-day gap)
    {row:'RETREAT 1',leaderName:'Tyler Brook',    retreatName:'Earth Flow',            startDate:'2027-03-25',endDate:'2027-04-01',pax:10,status:'requested'},
    // Apr — requested  (14-day gap)
    {row:'RETREAT 1',leaderName:'Priya Nair',     retreatName:'Shakti Arise',          startDate:'2027-04-15',endDate:'2027-04-22',pax:13,status:'requested'},

    // ════════════════════════════════════════
    //  RETREAT 2  ·  May 2026 → April 2027
    // ════════════════════════════════════════
    // May — straight-line pair
    {row:'RETREAT 2',leaderName:'Daniel Reed',    retreatName:'Sun & Soul',            startDate:'2026-05-15',endDate:'2026-05-22',pax:14,status:'room_list_sent'},
    {row:'RETREAT 2',leaderName:'Natalie Park',   retreatName:'Inner Child Healing',   startDate:'2026-05-22',endDate:'2026-05-29',pax:10,status:'room_list_sent'},
    // Jun — deposit_paid  (14-day gap)
    {row:'RETREAT 2',leaderName:'Tyler Collins',  retreatName:'Breathwork & Movement', startDate:'2026-06-12',endDate:'2026-06-19',pax:12,status:'deposit_paid'},
    // Jul — deposit_paid  (14-day gap)
    {row:'RETREAT 2',leaderName:'Rebecca Hall',   retreatName:"Women's Circle",        startDate:'2026-07-03',endDate:'2026-07-10',pax:11,status:'deposit_paid'},
    // Jul — contract_signed  (14-day gap)
    {row:'RETREAT 2',leaderName:'Chris Lee',      retreatName:'Mindful Vinyasa',       startDate:'2026-07-24',endDate:'2026-07-31',pax:14,status:'contract_signed'},
    // Aug — contract_signed  (21-day gap)
    {row:'RETREAT 2',leaderName:'Amanda Foster',  retreatName:'Kundalini Rising',      startDate:'2026-08-21',endDate:'2026-08-28',pax:9, status:'contract_signed'},
    // Sep — contract_sent  (14-day gap)
    {row:'RETREAT 2',leaderName:'Elena Vasquez',  retreatName:'Somatic Healing',       startDate:'2026-09-12',endDate:'2026-09-19',pax:11,status:'contract_sent'},
    // Oct — contract_sent  (14-day gap) → feeds straight-line chain
    {row:'RETREAT 2',leaderName:'Marcus Quinn',   retreatName:'Tulum Grounding',       startDate:'2026-10-03',endDate:'2026-10-10',pax:10,status:'contract_sent'},
    // Oct — straight-line pair  ↔↔
    {row:'RETREAT 2',leaderName:'Jade Summers',   retreatName:'Flow & Freedom',        startDate:'2026-10-10',endDate:'2026-10-17',pax:12,status:'room_list_sent'},
    {row:'RETREAT 2',leaderName:'Ryan Mitchell',  retreatName:'Ocean Breath',          startDate:'2026-10-17',endDate:'2026-10-24',pax:9, status:'room_list_sent'},
    // Nov — deposit_paid  (14-day gap)
    {row:'RETREAT 2',leaderName:'Samantha Cruz',  retreatName:'Rise & Restore',        startDate:'2026-11-07',endDate:'2026-11-14',pax:12,status:'deposit_paid'},
    // Nov-Dec — contract_sent  (14-day gap)
    {row:'RETREAT 2',leaderName:'Oliver Chang',   retreatName:'Reset & Renew',         startDate:'2026-11-28',endDate:'2026-12-05',pax:10,status:'contract_sent'},
    // Dec — requested  (14-day gap)
    {row:'RETREAT 2',leaderName:'Emma Park',      retreatName:'Winter Solstice Flow',  startDate:'2026-12-19',endDate:'2026-12-26',pax:11,status:'requested',teacherCode:'EMMA01'},
    // Jan 2027 — contract_signed  (9-day gap; Sarah Jennings starts Jan 14 — existing seed)
    {row:'RETREAT 2',leaderName:'Daniel Reed',    retreatName:'Desert Dreams',         startDate:'2027-01-04',endDate:'2027-01-11',pax:10,status:'contract_signed'},
    // [Sarah Jennings Jan 14-21 — existing seed · 3-day gap]
    // Straight-line out of Sarah Jennings
    {row:'RETREAT 2',leaderName:'Phoebe Lane',    retreatName:'Soul Blueprint',        startDate:'2027-01-21',endDate:'2027-01-28',pax:9, status:'room_list_sent'},
    // Feb — deposit_paid  (11-day gap)
    {row:'RETREAT 2',leaderName:'Marcus Hill',    retreatName:'Breathe Deep',          startDate:'2027-02-08',endDate:'2027-02-15',pax:13,status:'deposit_paid'},
    // Feb — contract_sent  (7-day gap)
    {row:'RETREAT 2',leaderName:'Jade Harris',    retreatName:'Coastal Calm',          startDate:'2027-02-22',endDate:'2027-03-01',pax:10,status:'contract_sent'},
    // Mar — requested  (14-day gap)
    {row:'RETREAT 2',leaderName:'Ryan Park',      retreatName:'Spring Detox',          startDate:'2027-03-15',endDate:'2027-03-22',pax:12,status:'requested'},
    // Apr — requested  (14-day gap)
    {row:'RETREAT 2',leaderName:'Samantha Wells', retreatName:'Bloom Retreat',         startDate:'2027-04-05',endDate:'2027-04-12',pax:9, status:'requested'},

    // ════════════════════════════════════════
    //  RETREAT 3  ·  May 2026 → April 2027
    // ════════════════════════════════════════
    // May — straight-line pair
    {row:'RETREAT 3',leaderName:'Olivia Green',   retreatName:'Beach & Beyond',        startDate:'2026-05-18',endDate:'2026-05-25',pax:8, status:'room_list_sent'},
    {row:'RETREAT 3',leaderName:'Samuel White',   retreatName:'Sound & Silence',       startDate:'2026-05-25',endDate:'2026-06-01',pax:10,status:'room_list_sent'},
    // Jun — deposit_paid  (14-day gap)
    {row:'RETREAT 3',leaderName:'Hannah Brown',   retreatName:'Aerial & Flow',         startDate:'2026-06-15',endDate:'2026-06-22',pax:12,status:'deposit_paid'},
    // Jul — deposit_paid  (14-day gap)
    {row:'RETREAT 3',leaderName:'Raj Patel',      retreatName:'Meditation Intensive',  startDate:'2026-07-06',endDate:'2026-07-13',pax:8, status:'deposit_paid'},
    // Jul — contract_signed  (14-day gap)
    {row:'RETREAT 3',leaderName:'Laura Kim',      retreatName:'Core & Restore',        startDate:'2026-07-27',endDate:'2026-08-03',pax:14,status:'contract_signed'},
    // Aug — contract_signed  (21-day gap)
    {row:'RETREAT 3',leaderName:'Marcus Bell',    retreatName:'Desert Detox',          startDate:'2026-08-24',endDate:'2026-08-31',pax:9, status:'contract_signed'},
    // Sep — contract_sent  (14-day gap)
    {row:'RETREAT 3',leaderName:'Elena Torres',   retreatName:'Elemental Yoga',        startDate:'2026-09-14',endDate:'2026-09-21',pax:10,status:'contract_sent'},
    // Oct — contract_sent  (14-day gap) → feeds straight-line
    {row:'RETREAT 3',leaderName:'Tom Harrison',   retreatName:'Cacao & Movement',      startDate:'2026-10-05',endDate:'2026-10-12',pax:10,status:'contract_sent'},
    // Oct — straight-line pair  ↔↔
    {row:'RETREAT 3',leaderName:'Nina Stone',     retreatName:'Wild & Free',           startDate:'2026-10-12',endDate:'2026-10-19',pax:11,status:'room_list_sent'},
    {row:'RETREAT 3',leaderName:'Diego Flores',   retreatName:'Tulum Roots Retreat',   startDate:'2026-10-19',endDate:'2026-10-26',pax:13,status:'room_list_sent'},
    // Nov — deposit_paid  (14-day gap)
    {row:'RETREAT 3',leaderName:'Chloe Morris',   retreatName:'Autumn Glow',           startDate:'2026-11-09',endDate:'2026-11-16',pax:10,status:'deposit_paid'},
    // Nov-Dec — contract_sent  (14-day gap)
    {row:'RETREAT 3',leaderName:'Victor Banks',   retreatName:'Mindful Tulum',         startDate:'2026-11-30',endDate:'2026-12-07',pax:12,status:'contract_sent'},
    // Dec — requested  (14-day gap)
    {row:'RETREAT 3',leaderName:'Aria Johnson',   retreatName:'Year-End Cleanse',      startDate:'2026-12-21',endDate:'2026-12-28',pax:9, status:'requested'},
    // Jan 2027 — contract_signed  (14-day gap)
    {row:'RETREAT 3',leaderName:'Raj Kumar',      retreatName:'Stillwater Rising',     startDate:'2027-01-11',endDate:'2027-01-18',pax:11,status:'contract_signed'},
    // Straight-line; then 7-day gap before Michael Torres Feb 1 (existing seed)
    {row:'RETREAT 3',leaderName:'Isabelle Renard',retreatName:'Pleine Conscience',     startDate:'2027-01-18',endDate:'2027-01-25',pax:10,status:'room_list_sent'},
    // [Michael Torres Feb 1-8 — existing seed · 7-day gap]
    // Straight-line out of Michael Torres
    {row:'RETREAT 3',leaderName:'Hannah Morris',  retreatName:'Breathe & Be',          startDate:'2027-02-08',endDate:'2027-02-15',pax:11,status:'room_list_sent'},
    // Feb — deposit_paid  (7-day gap)
    {row:'RETREAT 3',leaderName:'Marco Silva',    retreatName:'Coastal Cleanse',       startDate:'2027-02-22',endDate:'2027-03-01',pax:10,status:'deposit_paid'},
    // Mar — contract_sent  (14-day gap)
    {row:'RETREAT 3',leaderName:'Laura Chen',     retreatName:'Spring Yin',            startDate:'2027-03-15',endDate:'2027-03-22',pax:12,status:'contract_sent'},
    // Apr — requested  (14-day gap)
    {row:'RETREAT 3',leaderName:'Marcus Vibe',    retreatName:'Mayan Wellness',        startDate:'2027-04-05',endDate:'2027-04-12',pax:9, status:'requested'},

    // ════════════════════════════════════════
    //  RETREAT 4  ·  May 2026 → April 2027
    // ════════════════════════════════════════
    // May — straight-line pair
    {row:'RETREAT 4',leaderName:'Ava Johnson',    retreatName:'Sunset Yoga',           startDate:'2026-05-24',endDate:'2026-05-31',pax:12,status:'room_list_sent'},
    {row:'RETREAT 4',leaderName:'Noah Davis',     retreatName:'Ocean Warriors',        startDate:'2026-05-31',endDate:'2026-06-07',pax:14,status:'room_list_sent'},
    // Jun — deposit_paid  (14-day gap)
    {row:'RETREAT 4',leaderName:'Grace Wilson',   retreatName:'Feminine Embodiment',   startDate:'2026-06-21',endDate:'2026-06-28',pax:10,status:'deposit_paid'},
    // Jul — deposit_paid  (14-day gap)
    {row:'RETREAT 4',leaderName:'Liam O\'Brien',  retreatName:'Surf & Shakti',         startDate:'2026-07-12',endDate:'2026-07-19',pax:16,status:'deposit_paid'},
    // Aug — contract_signed  (14-day gap)
    {row:'RETREAT 4',leaderName:'Chloe Fox',      retreatName:'Wild Woman',            startDate:'2026-08-02',endDate:'2026-08-09',pax:11,status:'contract_signed'},
    // Aug — contract_signed  (21-day gap)
    {row:'RETREAT 4',leaderName:'Ben Carter',     retreatName:'Resilience Retreat',    startDate:'2026-08-30',endDate:'2026-09-06',pax:13,status:'contract_signed'},
    // Sep — contract_sent  (14-day gap)
    {row:'RETREAT 4',leaderName:'Maya Okafor',    retreatName:'Tulum Transformation',  startDate:'2026-09-20',endDate:'2026-09-27',pax:12,status:'contract_sent'},
    // Oct — contract_sent  (14-day gap) → feeds straight-line
    {row:'RETREAT 4',leaderName:'Ryan Stark',     retreatName:'Power Reset',           startDate:'2026-10-11',endDate:'2026-10-18',pax:10,status:'contract_sent'},
    // Oct — straight-line pair  ↔↔
    {row:'RETREAT 4',leaderName:'Zoe Kim',        retreatName:'Glow & Flow',           startDate:'2026-10-18',endDate:'2026-10-25',pax:12,status:'room_list_sent'},
    {row:'RETREAT 4',leaderName:'Finn Evans',     retreatName:'Deep Roots',            startDate:'2026-10-25',endDate:'2026-11-01',pax:9, status:'room_list_sent'},
    // Nov — deposit_paid  (14-day gap)
    {row:'RETREAT 4',leaderName:'Diana Ross',     retreatName:'Sacred Circle',         startDate:'2026-11-15',endDate:'2026-11-22',pax:11,status:'deposit_paid'},
    // Dec — contract_sent  (14-day gap)
    {row:'RETREAT 4',leaderName:'Tyler Moon',     retreatName:'Solstice Yoga',         startDate:'2026-12-06',endDate:'2026-12-13',pax:12,status:'contract_sent'},
    // Dec — requested  (14-day gap)
    {row:'RETREAT 4',leaderName:'Max Chen',       retreatName:'New Horizons',          startDate:'2026-12-27',endDate:'2027-01-03',pax:10,status:'requested'},
    // Jan 2027 — contract_signed  (7-day gap)
    {row:'RETREAT 4',leaderName:'Sebastian Cruz', retreatName:'Tulum Roots',           startDate:'2027-01-10',endDate:'2027-01-17',pax:11,status:'contract_signed'},
    // Straight-line
    {row:'RETREAT 4',leaderName:'Ava Brooks',     retreatName:'Soul Reset',            startDate:'2027-01-17',endDate:'2027-01-24',pax:12,status:'room_list_sent'},
    // Feb — deposit_paid  (7-day gap)
    {row:'RETREAT 4',leaderName:'Noah Grant',     retreatName:'Deep Blue',             startDate:'2027-01-31',endDate:'2027-02-07',pax:14,status:'deposit_paid'},
    // Straight-line
    {row:'RETREAT 4',leaderName:'Jade Storm',     retreatName:'Rise & Shine',          startDate:'2027-02-07',endDate:'2027-02-14',pax:10,status:'room_list_sent'},
    // Feb — contract_sent  (7-day gap)
    {row:'RETREAT 4',leaderName:'Grace Park',     retreatName:'Coastal Power',         startDate:'2027-02-21',endDate:'2027-02-28',pax:11,status:'contract_sent'},
    // Mar — requested  (14-day gap)
    {row:'RETREAT 4',leaderName:'Liam Swift',     retreatName:'Jungle Bloom',          startDate:'2027-03-14',endDate:'2027-03-21',pax:10,status:'requested'},
    // Apr — requested  (14-day gap)
    {row:'RETREAT 4',leaderName:'Chloe Berg',     retreatName:'Earth & Sky',           startDate:'2027-04-04',endDate:'2027-04-11',pax:12,status:'requested'},
    // Apr — requested  (14-day gap)
    {row:'RETREAT 4',leaderName:'Ben Stone',      retreatName:'Year-Round Flow',       startDate:'2027-04-25',endDate:'2027-05-02',pax:9, status:'requested'},

    // ════════════════════════════════════════
    //  LOW SEASON FILL-IN  ·  Jun – Aug 2026
    //  Filling gaps in all 4 rows
    // ════════════════════════════════════════

    // RETREAT 1 — gap fills
    {row:'RETREAT 1',leaderName:'Mia Santos',      retreatName:'Coastal Yin',          startDate:'2026-06-14',endDate:'2026-06-21',pax:9, status:'contract_signed'},
    {row:'RETREAT 1',leaderName:'Diego Vargas',    retreatName:'Breathwork Immersion', startDate:'2026-07-12',endDate:'2026-07-19',pax:13,status:'contract_sent'},
    {row:'RETREAT 1',leaderName:'Naomi Clarke',    retreatName:'Jungle Medicine',      startDate:'2026-08-01',endDate:'2026-08-08',pax:10,status:'contract_sent'},
    {row:'RETREAT 1',leaderName:'Ryan Osei',       retreatName:'Caribbean Reset',      startDate:'2026-08-22',endDate:'2026-08-29',pax:8, status:'requested'},

    // RETREAT 2 — gap fills
    {row:'RETREAT 2',leaderName:'Tara Wells',      retreatName:'Intuitive Flow',       startDate:'2026-06-19',endDate:'2026-06-26',pax:11,status:'contract_signed'},
    {row:'RETREAT 2',leaderName:'Jordan Black',    retreatName:'Men\'s Wellness Week', startDate:'2026-07-17',endDate:'2026-07-24',pax:10,status:'contract_sent'},
    {row:'RETREAT 2',leaderName:'Isabel Moreno',   retreatName:'Womb Wisdom',          startDate:'2026-08-07',endDate:'2026-08-14',pax:12,status:'contract_sent'},
    {row:'RETREAT 2',leaderName:'Caleb Rivers',    retreatName:'Tulum Sun Salutation', startDate:'2026-08-28',endDate:'2026-09-04',pax:9, status:'requested'},

    // RETREAT 3 — gap fills
    {row:'RETREAT 3',leaderName:'Fiona Marsh',     retreatName:'Moon & Tides',         startDate:'2026-06-08',endDate:'2026-06-15',pax:9, status:'contract_signed'},
    {row:'RETREAT 3',leaderName:'Eli Nakamura',    retreatName:'Zen Body Retreat',     startDate:'2026-06-22',endDate:'2026-06-29',pax:14,status:'deposit_paid'},
    {row:'RETREAT 3',leaderName:'Paloma Reyes',    retreatName:'Serpent & Sun',        startDate:'2026-07-13',endDate:'2026-07-20',pax:8, status:'contract_sent'},
    {row:'RETREAT 3',leaderName:'Henrik Lars',     retreatName:'Nordic Detox',         startDate:'2026-08-10',endDate:'2026-08-17',pax:12,status:'contract_sent'},

    // RETREAT 4 — gap fills
    {row:'RETREAT 4',leaderName:'Simone Dupont',   retreatName:'Liberté Movement',     startDate:'2026-06-14',endDate:'2026-06-21',pax:11,status:'contract_signed'},
    {row:'RETREAT 4',leaderName:'Keanu Malu',      retreatName:'Ocean Healing Arts',   startDate:'2026-07-05',endDate:'2026-07-12',pax:9, status:'contract_sent'},
    {row:'RETREAT 4',leaderName:'Asha Devi',       retreatName:'Shakti Power',         startDate:'2026-07-26',endDate:'2026-08-02',pax:13,status:'contract_sent'},
    {row:'RETREAT 4',leaderName:'Miles Hunter',    retreatName:'Mindful Men\'s Escape',startDate:'2026-08-16',endDate:'2026-08-23',pax:10,status:'requested'},
  ];

  sample.forEach(d=>{
    AppData.bookings.push({...d,_isSample:true,id:uid(),notes:'',docLink:'',roomAssignments:[],blockedRooms:[]});
  });
  venYear=2026;
  saveAll();venBuild();buildDashboard();
  showToast(`${sample.length} sample retreats loaded!`);
}

function clearAllData(){
  if(!confirm('Clear ALL bookings and guest registrations?\n\nThis cannot be undone. Room types, venue rows, and staff accounts will be kept.\n\nMake sure you have a backup first.'))return;
  AppData.bookings=[];AppData.regs=[];
  venYear=new Date().getFullYear();
  saveAll();venBuild();buildDashboard();
  regInitSel();regRender();
  showToast('All bookings and registrations cleared.');
}

function fillSampleTransportData(){
  if(!confirm('Fill all May 2026 retreats with guests, room assignments and flight details?\n\nExisting sample data for these retreats will be replaced.'))return;

  const mayBks=AppData.bookings.filter(b=>b.startDate>='2026-05-01'&&b.startDate<='2026-05-31');
  if(!mayBks.length){alert('No May 2026 retreats found — click "+ Fill Sample Data" first.');return;}

  // ── Room type map (real room numbers) ──────────────────────────────────────
  const RT={
    rt1:{id:'rt1',name:'Beachfront King',   rooms:['20','21','22','23','24','25','29','30','33'],price1:575},
    rt2:{id:'rt2',name:'Superior King',     rooms:['1B','34','35','36'],                         price1:475},
    rt3:{id:'rt3',name:'Garden Plus King',  rooms:['9n','10n','17','GV19','GV20'],               price1:390},
    rt4:{id:'rt4',name:'Garden King',       rooms:['GV1','GV2','GV3','GV4','GV5','GV6','GV14','GV15','GV16','GV17','GV18','GV21','GV22'],price1:345},
    rt5:{id:'rt5',name:'Garden Basic',      rooms:['15','GV7','GV8','GV9','GV10','GV11','GV12'],price1:295},
    rt6:{id:'rt6',name:'Double Beachview',  rooms:['2A','4A','4B','12','19A','19B','26','27','28','31'],price1:335},
    rt7:{id:'rt7',name:'Double Room',       rooms:['1A','5','13','18','GV13'],                   price1:275},
    rt8:{id:'rt8',name:'Triple',            rooms:['6','11','14b','32'],                          price1:275},
  };

  // ── Per-retreat room plans (rooms to block + type mapping) ────────────────
  // Shared by back-to-back retreats on the same row
  const ROOM_PLANS={
    'RETREAT 1':[ // Anna Martinez → Carlos Mendez
      {room:'20', rtId:'rt1'},{room:'21',rtId:'rt1'},{room:'22',rtId:'rt1'},
      {room:'34', rtId:'rt2'},{room:'35',rtId:'rt2'},
      {room:'GV19',rtId:'rt3'},{room:'GV20',rtId:'rt3'},
      {room:'GV1', rtId:'rt4'},{room:'GV2',rtId:'rt4'},{room:'GV3',rtId:'rt4'},{room:'GV4',rtId:'rt4'},
      {room:'GV7', rtId:'rt5'},{room:'GV8',rtId:'rt5'},{room:'GV9',rtId:'rt5'},
      {room:'2A',  rtId:'rt6'},{room:'4A',rtId:'rt6'},
      {room:'1A',  rtId:'rt7'},{room:'5',rtId:'rt7'},
      {room:'6',   rtId:'rt8'},
    ],
    'RETREAT 2':[ // Daniel Reed → Natalie Park
      {room:'23', rtId:'rt1'},{room:'24',rtId:'rt1'},{room:'25',rtId:'rt1'},
      {room:'1B', rtId:'rt2'},{room:'36',rtId:'rt2'},
      {room:'9n', rtId:'rt3'},{room:'10n',rtId:'rt3'},
      {room:'GV5', rtId:'rt4'},{room:'GV6',rtId:'rt4'},{room:'GV14',rtId:'rt4'},{room:'GV15',rtId:'rt4'},
      {room:'GV10',rtId:'rt5'},{room:'GV11',rtId:'rt5'},{room:'GV12',rtId:'rt5'},
      {room:'4B',  rtId:'rt6'},{room:'12',rtId:'rt6'},
      {room:'13',  rtId:'rt7'},{room:'18',rtId:'rt7'},
      {room:'11',  rtId:'rt8'},
    ],
    'RETREAT 3':[ // Olivia Green → Samuel White
      {room:'29', rtId:'rt1'},{room:'30',rtId:'rt1'},
      {room:'17', rtId:'rt3'},
      {room:'GV16',rtId:'rt4'},{room:'GV17',rtId:'rt4'},{room:'GV18',rtId:'rt4'},
      {room:'15', rtId:'rt5'},{room:'GV7',rtId:'rt5'},
      {room:'19A',rtId:'rt6'},{room:'19B',rtId:'rt6'},
      {room:'GV13',rtId:'rt7'},
      {room:'14b',rtId:'rt8'},
    ],
  };

  // ── Guest pools per retreat leader ────────────────────────────────────────
  const POOLS={
    // ── Anna Martinez: 4 CUN groups + 1 TQO group + 2 solos ────────────────
    'Anna Martinez':[
      // CUN Group A (4 pax · 09:00–09:18 → $65/person)
      {fn:'Sarah',    ln:'Johnson',    em:'sarah.j@gmail.com',      fl:'AA1234',at:'09:00',ap:'cancun', dt:'14:00',dp:'cancun', sh:true,  room:'20',  rtId:'rt1'},
      {fn:'Michelle', ln:'Torres',     em:'m.torres@icloud.com',    fl:'AA1236',at:'09:08',ap:'cancun', dt:'14:30',dp:'cancun', sh:true,  room:'21',  rtId:'rt1'},
      {fn:'Lisa',     ln:'Park',       em:'lisa.park@gmail.com',    fl:'UA5678',at:'09:15',ap:'cancun', dt:'16:30',dp:'cancun', sh:true,  room:'22',  rtId:'rt1'},
      {fn:'Yuki',     ln:'Nakamura',   em:'y.nakamura@gmail.com',   fl:'AM450', at:'09:18',ap:'cancun', dt:'13:00',dp:'cancun', sh:true,  room:'GV20',rtId:'rt3'},
      // CUN Group B (3 pax · 10:30–10:50 → $80/person)
      {fn:'Claire',   ln:'Dubois',     em:'c.dubois@gmail.com',     fl:'AC890', at:'10:30',ap:'cancun', dt:'15:00',dp:'cancun', sh:true,  room:'34',  rtId:'rt2'},
      {fn:'Anna',     ln:'Bergström',  em:'aberg@hotmail.com',      fl:'BA221', at:'10:42',ap:'cancun', dt:'16:00',dp:'cancun', sh:true,  room:'35',  rtId:'rt2'},
      {fn:'Rachel',   ln:'Kim',        em:'rachel.k@yahoo.com',     fl:'DL312', at:'10:50',ap:'cancun', dt:'17:00',dp:'cancun', sh:true,  room:'GV1', rtId:'rt4'},
      // TQO Group C (2 pax · 11:00–11:14 → $80/person)
      {fn:'Maria',    ln:'Santos',     em:'msantos@outlook.com',    fl:'VB901', at:'11:00',ap:'tulum',  dt:'12:00',dp:'tulum',  sh:true,  room:'GV19',rtId:'rt3'},
      {fn:'Sofia',    ln:'Álvarez',    em:'s.alvarez@gmail.com',    fl:'VB302', at:'11:14',ap:'tulum',  dt:'11:00',dp:'tulum',  sh:true,  room:'GV7', rtId:'rt5'},
      // CUN Group D (3 pax · 13:30–13:48 → $80/person)
      {fn:'Amber',    ln:'Ross',       em:'amber.ross@gmail.com',   fl:'UA102', at:'13:30',ap:'cancun', dt:'17:30',dp:'cancun', sh:true,  room:'GV2', rtId:'rt4'},
      {fn:'Priya',    ln:'Kapoor',     em:'priya.k@gmail.com',      fl:'UA104', at:'13:42',ap:'cancun', dt:'18:00',dp:'cancun', sh:true,  room:'GV3', rtId:'rt4'},
      {fn:'Jade',     ln:'Bennett',    em:'jade.b@outlook.com',     fl:'WN567', at:'13:48',ap:'cancun', dt:'18:30',dp:'cancun', sh:true,  room:'2A',  rtId:'rt6'},
      // CUN solos
      {fn:'Taylor',   ln:'Morgan',     em:'t.morgan@yahoo.com',     fl:'B6789', at:'15:30',ap:'cancun', dt:'13:00',dp:'cancun', sh:false, room:'1A',  rtId:'rt7'},
      {fn:'Chloe',    ln:'Wright',     em:'c.wright@gmail.com',     fl:'AA999', at:'16:45',ap:'cancun', dt:'14:00',dp:'cancun', sh:false, room:'6',   rtId:'rt8'},
    ],
    // ── Carlos Mendez: 3 CUN groups + 1 TQO group + 1 solo ─────────────────
    'Carlos Mendez':[
      // CUN Group A (3 pax · 08:45–09:00 → $80/person)
      {fn:'James',    ln:'Wilson',     em:'j.wilson@gmail.com',     fl:'AA2345',at:'08:45',ap:'cancun', dt:'11:00',dp:'cancun', sh:true,  room:'20',  rtId:'rt1'},
      {fn:'Emma',     ln:'Davis',      em:'edavis@gmail.com',       fl:'DL3456',at:'08:52',ap:'cancun', dt:'13:30',dp:'cancun', sh:true,  room:'21',  rtId:'rt1'},
      {fn:'Lucas',    ln:'Fernández',  em:'l.fernandez@gmail.com',  fl:'AM301', at:'09:00',ap:'cancun', dt:'12:00',dp:'cancun', sh:true,  room:'22',  rtId:'rt1'},
      // CUN Group B (3 pax · 10:30–10:46 → $80/person)
      {fn:'Priya',    ln:'Mehta',      em:'priya.m@hotmail.com',    fl:'UA789', at:'10:30',ap:'cancun', dt:'14:00',dp:'cancun', sh:true,  room:'34',  rtId:'rt2'},
      {fn:'Isla',     ln:'McDonald',   em:'isla.mc@icloud.com',     fl:'AC234', at:'10:38',ap:'cancun', dt:'15:00',dp:'cancun', sh:true,  room:'GV1', rtId:'rt4'},
      {fn:'Marco',    ln:'Rossi',      em:'m.rossi@outlook.com',    fl:'LH880', at:'10:46',ap:'cancun', dt:'16:00',dp:'cancun', sh:true,  room:'GV2', rtId:'rt4'},
      // TQO Group C (2 pax · 11:15–11:28 → $80/person)
      {fn:'Hana',     ln:'Suzuki',     em:'hana.s@gmail.com',       fl:'AM455', at:'11:15',ap:'tulum',  dt:'13:00',dp:'tulum',  sh:true,  room:'GV19',rtId:'rt3'},
      {fn:'Leila',    ln:'Hassan',     em:'l.hassan@gmail.com',     fl:'VB404', at:'11:28',ap:'tulum',  dt:'12:30',dp:'tulum',  sh:true,  room:'GV7', rtId:'rt5'},
      // CUN Group D (3 pax · 14:50–15:07 → $80/person)
      {fn:'Brooke',   ln:'Sullivan',   em:'b.sullivan@yahoo.com',   fl:'WN612', at:'14:50',ap:'cancun', dt:'17:00',dp:'cancun', sh:true,  room:'4A',  rtId:'rt6'},
      {fn:'Nina',     ln:'Okafor',     em:'nina.o@gmail.com',       fl:'BA334', at:'14:58',ap:'cancun', dt:'17:30',dp:'cancun', sh:true,  room:'5',   rtId:'rt7'},
      {fn:'Grace',    ln:'Tan',        em:'grace.tan@gmail.com',    fl:'UA998', at:'15:07',ap:'cancun', dt:'18:00',dp:'cancun', sh:true,  room:'6',   rtId:'rt8'},
      // CUN solo
      {fn:'Zara',     ln:'Ahmed',      em:'z.ahmed@gmail.com',      fl:'AM560', at:'17:00',ap:'cancun', dt:'10:00',dp:'cancun', sh:false, room:'GV3', rtId:'rt4'},
    ],
    // ── Daniel Reed: varied group sizes to show full pricing range ─────────
    'Daniel Reed':[
      // CUN Group A (4 pax · 08:30–08:52 → $65/person, save $130 vs solo)
      {fn:'Robert',   ln:'Chen',       em:'rchen@gmail.com',        fl:'UA4567',at:'08:30',ap:'cancun', dt:'10:00',dp:'cancun', sh:true,  room:'23',  rtId:'rt1'},
      {fn:'Kevin',    ln:'Adams',      em:'kadams@gmail.com',       fl:'AA678', at:'08:40',ap:'cancun', dt:'15:00',dp:'cancun', sh:true,  room:'25',  rtId:'rt1'},
      {fn:'Patricia', ln:'Müller',     em:'p.muller@gmail.com',     fl:'LH445', at:'08:48',ap:'cancun', dt:'13:30',dp:'cancun', sh:true,  room:'1B',  rtId:'rt2'},
      {fn:'Diego',    ln:'Ramírez',    em:'d.ramirez@hotmail.com',  fl:'AM712', at:'08:52',ap:'cancun', dt:'14:00',dp:'cancun', sh:true,  room:'9n',  rtId:'rt3'},
      // TQO Group B (2 pax · 09:15–09:28 → $80/person)
      {fn:'Jennifer', ln:'White',      em:'jwhite@outlook.com',     fl:'VB567', at:'09:15',ap:'tulum',  dt:'11:30',dp:'tulum',  sh:true,  room:'24',  rtId:'rt1'},
      {fn:'Aisha',    ln:'Osei',       em:'a.osei@gmail.com',       fl:'BA112', at:'09:28',ap:'tulum',  dt:'12:30',dp:'tulum',  sh:true,  room:'10n', rtId:'rt3'},
      // CUN Group C (2 pax · 10:30–10:45 → $100/person)
      {fn:'Finn',     ln:'O\'Brien',   em:'finn.ob@icloud.com',     fl:'AC567', at:'10:30',ap:'cancun', dt:'16:00',dp:'cancun', sh:true,  room:'GV5', rtId:'rt4'},
      {fn:'Isabelle', ln:'Leclerc',    em:'i.leclerc@gmail.com',    fl:'AC569', at:'10:45',ap:'cancun', dt:'16:30',dp:'cancun', sh:true,  room:'GV6', rtId:'rt4'},
      // CUN Group D (3 pax · 13:30–13:50 → $80/person)
      {fn:'Tomás',    ln:'Vargas',     em:'t.vargas@yahoo.com',     fl:'AM320', at:'13:30',ap:'cancun', dt:'17:00',dp:'cancun', sh:true,  room:'GV10',rtId:'rt5'},
      {fn:'Ben',      ln:'Carter',     em:'ben.c@outlook.com',      fl:'DL889', at:'13:42',ap:'cancun', dt:'18:00',dp:'cancun', sh:true,  room:'4B',  rtId:'rt6'},
      {fn:'Sasha',    ln:'Ivanova',    em:'s.ivanova@gmail.com',    fl:'DL891', at:'13:50',ap:'cancun', dt:'18:30',dp:'cancun', sh:true,  room:'13',  rtId:'rt7'},
      // TQO Group E (2 pax · 15:00–15:10 → $80/person)
      {fn:'Mei',      ln:'Lin',        em:'mei.lin@gmail.com',      fl:'AM322', at:'15:00',ap:'tulum',  dt:'10:00',dp:'tulum',  sh:true,  room:'GV11',rtId:'rt5'},
      {fn:'Nia',      ln:'Williams',   em:'nia.w@yahoo.com',        fl:'WN340', at:'15:10',ap:'tulum',  dt:'13:00',dp:'tulum',  sh:true,  room:'GV14',rtId:'rt4'},
      // CUN solo ($195 Private Transport)
      {fn:'Oliver',   ln:'Hughes',     em:'o.hughes@gmail.com',     fl:'BA990', at:'17:05',ap:'cancun', dt:'11:00',dp:'cancun', sh:false, room:'11',  rtId:'rt8'},
    ],
    // ── Natalie Park: 3 CUN groups + 2 solos ───────────────────────────────
    'Natalie Park':[
      // CUN Group A (3 pax · 09:00–09:18 → $80/person)
      {fn:'Sophie',   ln:'Turner',     em:'sturner@gmail.com',      fl:'BA100', at:'09:00',ap:'cancun', dt:'13:00',dp:'cancun', sh:true,  room:'23',  rtId:'rt1'},
      {fn:'Mia',      ln:'Lopez',      em:'mia.l@yahoo.com',        fl:'AA200', at:'09:10',ap:'cancun', dt:'14:30',dp:'cancun', sh:true,  room:'24',  rtId:'rt1'},
      {fn:'Tara',     ln:'Singh',      em:'tara.s@gmail.com',       fl:'UA300', at:'09:18',ap:'cancun', dt:'15:00',dp:'cancun', sh:true,  room:'25',  rtId:'rt1'},
      // TQO solo
      {fn:'Layla',    ln:'Mansouri',   em:'l.mansouri@outlook.com', fl:'AM410', at:'11:00',ap:'tulum',  dt:'12:00',dp:'tulum',  sh:false, room:'1B',  rtId:'rt2'},
      // CUN Group B (3 pax · 12:30–12:50 → $80/person)
      {fn:'Fiona',    ln:'Campbell',   em:'f.campbell@icloud.com',  fl:'AC777', at:'12:30',ap:'cancun', dt:'16:00',dp:'cancun', sh:true,  room:'9n',  rtId:'rt3'},
      {fn:'Renee',    ln:'Dupont',     em:'r.dupont@gmail.com',     fl:'LH560', at:'12:40',ap:'cancun', dt:'17:00',dp:'cancun', sh:true,  room:'GV5', rtId:'rt4'},
      {fn:'Kayla',    ln:'Brooks',     em:'k.brooks@gmail.com',     fl:'WN450', at:'12:50',ap:'cancun', dt:'17:30',dp:'cancun', sh:true,  room:'GV6', rtId:'rt4'},
      // CUN Group C (2 pax · 14:45–14:58 → $100/person)
      {fn:'Ingrid',   ln:'Larsson',    em:'i.larsson@gmail.com',    fl:'BA662', at:'14:45',ap:'cancun', dt:'18:00',dp:'cancun', sh:true,  room:'GV10',rtId:'rt5'},
      {fn:'Zoe',      ln:'Mitchell',   em:'z.mitchell@yahoo.com',   fl:'DL770', at:'14:58',ap:'cancun', dt:'14:00',dp:'cancun', sh:true,  room:'11',  rtId:'rt8'},
      // TQO solo
      {fn:'Camille',  ln:'Bernard',    em:'c.bernard@icloud.com',   fl:'LH562', at:'15:30',ap:'tulum',  dt:'11:00',dp:'tulum',  sh:false, room:'4B',  rtId:'rt6'},
    ],
    // ── Olivia Green: 2 CUN groups + 2 solos ───────────────────────────────
    'Olivia Green':[
      // CUN Group A (3 pax · 08:00–08:18 → $80/person)
      {fn:'Tom',      ln:'Harris',     em:'tom.h@gmail.com',        fl:'DL300', at:'08:00',ap:'cancun', dt:'12:00',dp:'cancun', sh:true,  room:'29',  rtId:'rt1'},
      {fn:'Nina',     ln:'Patel',      em:'nina.p@gmail.com',       fl:'UA400', at:'08:10',ap:'cancun', dt:'15:00',dp:'cancun', sh:true,  room:'30',  rtId:'rt1'},
      {fn:'Lily',     ln:'Chang',      em:'lily.c@gmail.com',       fl:'AM630', at:'08:18',ap:'cancun', dt:'13:30',dp:'cancun', sh:true,  room:'GV16',rtId:'rt4'},
      // TQO solo
      {fn:'Carlos',   ln:'Reyes',      em:'c.reyes@hotmail.com',    fl:'VB500', at:'09:30',ap:'tulum',  dt:'10:00',dp:'tulum',  sh:false, room:'17',  rtId:'rt3'},
      // CUN Group B (3 pax · 11:00–11:20 → $80/person)
      {fn:'Ananya',   ln:'Bose',       em:'a.bose@gmail.com',       fl:'AM632', at:'11:00',ap:'cancun', dt:'14:00',dp:'cancun', sh:true,  room:'GV17',rtId:'rt4'},
      {fn:'Petra',    ln:'Novak',      em:'p.novak@gmail.com',      fl:'LH770', at:'11:12',ap:'cancun', dt:'16:00',dp:'cancun', sh:true,  room:'19A', rtId:'rt6'},
      {fn:'Simone',   ln:'Laurent',    em:'s.laurent@gmail.com',    fl:'LH772', at:'11:20',ap:'cancun', dt:'16:30',dp:'cancun', sh:true,  room:'GV13',rtId:'rt7'},
      // TQO solo
      {fn:'Rosa',     ln:'Escobar',    em:'r.escobar@outlook.com',  fl:'AM634', at:'12:30',ap:'tulum',  dt:'11:30',dp:'tulum',  sh:false, room:'15',  rtId:'rt5'},
    ],
    // ── Samuel White: 3 CUN groups + 2 solos ───────────────────────────────
    'Samuel White':[
      // CUN Group A (3 pax · 09:00–09:18 → $80/person)
      {fn:'Ethan',    ln:'Moore',      em:'e.moore@gmail.com',      fl:'UA550', at:'09:00',ap:'cancun', dt:'12:00',dp:'cancun', sh:true,  room:'29',  rtId:'rt1'},
      {fn:'Ava',      ln:'Thompson',   em:'ava.t@yahoo.com',        fl:'AA660', at:'09:10',ap:'cancun', dt:'13:00',dp:'cancun', sh:true,  room:'30',  rtId:'rt1'},
      {fn:'Liam',     ln:'Walsh',      em:'l.walsh@icloud.com',     fl:'AC880', at:'09:18',ap:'cancun', dt:'14:00',dp:'cancun', sh:true,  room:'17',  rtId:'rt3'},
      // TQO solo
      {fn:'Amara',    ln:'Diallo',     em:'a.diallo@gmail.com',     fl:'BA445', at:'11:15',ap:'tulum',  dt:'12:00',dp:'tulum',  sh:false, room:'GV16',rtId:'rt4'},
      // CUN Group B (3 pax · 12:00–12:20 → $80/person)
      {fn:'Yara',     ln:'Khalil',     em:'y.khalil@outlook.com',   fl:'LH990', at:'12:00',ap:'cancun', dt:'15:00',dp:'cancun', sh:true,  room:'GV17',rtId:'rt4'},
      {fn:'Niamh',    ln:'Gallagher',  em:'n.gallagher@icloud.com', fl:'BA447', at:'12:10',ap:'cancun', dt:'15:30',dp:'cancun', sh:true,  room:'GV18',rtId:'rt4'},
      {fn:'Elodie',   ln:'Martin',     em:'e.martin@gmail.com',     fl:'LH992', at:'12:20',ap:'cancun', dt:'16:00',dp:'cancun', sh:true,  room:'15',  rtId:'rt5'},
      // TQO solo
      {fn:'Suki',     ln:'Yamamoto',   em:'suki.y@gmail.com',       fl:'AM780', at:'14:15',ap:'tulum',  dt:'11:00',dp:'tulum',  sh:false, room:'19B', rtId:'rt6'},
      // CUN Group C (2 pax · 15:00–15:12 → $100/person)
      {fn:'Ivan',     ln:'Sokolov',    em:'i.sokolov@gmail.com',    fl:'LH994', at:'15:00',ap:'cancun', dt:'17:00',dp:'cancun', sh:true,  room:'GV13',rtId:'rt7'},
      {fn:'Ines',     ln:'Ferreira',   em:'i.ferreira@outlook.com', fl:'LH996', at:'15:12',ap:'cancun', dt:'17:30',dp:'cancun', sh:true,  room:'14b', rtId:'rt8'},
    ],
  };

  // Clear previous sample regs and transport for these bookings
  const mayIds=new Set(mayBks.map(b=>b.id));
  AppData.regs=AppData.regs.filter(r=>!mayIds.has(r.bookingId));
  const cleanedTr=loadTransport().filter(t=>!mayIds.has(t.bookingId));
  const newTr=[...cleanedTr];

  mayBks.forEach(bk=>{
    const plan=ROOM_PLANS[bk.row];
    const pool=POOLS[bk.leaderName];
    if(!pool)return;

    // Block rooms from the plan for this row
    if(plan)bk.blockedRooms=[...new Set(plan.map(p=>p.room))];

    // Create room registrations
    pool.forEach(g=>{
      const rt=RT[g.rtId];
      AppData.regs.push({
        id:'sr_'+uid(),bookingId:bk.id,room:g.room,roomTypeId:g.rtId,
        guests:[{name:g.fn+' '+g.ln,email:g.em,phone:''}],
        amountPaid:0,customPrice:null,
        createdAt:new Date().toISOString()
      });
    });

    // Create transport submissions
    pool.forEach(g=>{
      const shareNote=g.sh?'Happy to share a ride and wait up to 30 minutes for a cheaper transfer.':'';
      newTr.push({
        id:'tr_'+uid(),submittedAt:new Date().toISOString(),
        bookingId:bk.id,
        firstName:g.fn,lastName:g.ln,email:g.em,
        flightNumber:g.fl,
        arrivalDate:bk.startDate,arrivalTime:g.at,arrivalAirport:g.ap,
        departureDate:bk.endDate,departureTime:g.dt,departureAirport:g.dp,
        notes:shareNote,willingToShare:g.sh
      });
    });
  });

  localStorage.setItem('amansala_room_regs',JSON.stringify(AppData.regs));
  saveTransport(newTr);
  saveAll();
  const total=Object.values(POOLS).reduce((s,p)=>s+p.length,0);
  showToast(`✓ ${total} guests added across ${mayBks.length} May retreats!`);
  if(document.getElementById('trContent'))trInit();
  buildDashboard();
}

