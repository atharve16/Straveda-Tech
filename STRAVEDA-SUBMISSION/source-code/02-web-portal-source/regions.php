<?php
/**
 * The zones and regions (regional offices) the portal knows: the 16 zones, 70 regions and 337 sales areas of the client's updated FY27 mapping (Zone-RO-SA-State-District Mapping).
 * ONE list used by auth.php (accounts) and orders.php (orders, SAP numbers, reports) - add a zone or region here and nowhere else.
 *
 * - ORD_SHEET_ZONES: the client's zones, each with its regions and the portal zone it belongs to.
 * - ORD_ZONES: the portal zones (orders and outlets are stored under these) with the states they cover. The first three are the original ones; the
 *   other zones are each their own portal zone.
 * - ORD_STATE_RO: a state with its regions (informational: every region has one main state).
 * - ORD_RO_SA: every region with its sales areas (SA) - what a Regional Officer is given instead of districts.
 * Region names are written exactly as in the outlet list (portal_outlets.ro).
 */

const ORD_ZONES = [
    'Central Zone' => ['Madhya Pradesh', 'Odisha', 'Chhattisgarh'],
    'East Central Zone' => ['Bihar', 'Jharkhand'],
    'North Central Retail' => ['Uttar Pradesh', 'Uttarakhand'],
    'Bengaluru Zone' => ['Karnataka'],
    'Chandigarh Zone' => ['Punjab', 'Chandigarh', 'Jammu and Kashmir', 'Himachal Pradesh'],
    'Cochin Zone' => ['Kerala'],
    'East Zone' => ['West Bengal'],
    'Guwahati Zone' => ['Assam'],
    'Jaipur Zone' => ['Rajasthan'],
    'North West Retail Zone' => ['Gujarat'],
    'North Zone' => ['Delhi', 'Haryana'],
    'South Central Retail' => ['Andhra Pradesh', 'Telangana'],
    'South Zone' => ['Tamil Nadu'],
    'West Zone' => ['Maharashtra', 'Goa'],
];
const ORD_STATE_RO = [
    'Karnataka' => ['BELGAUM RET RO', 'BELLARY RET RO', 'BENGALURU RET RO', 'GULBARGA RETAIL RO', 'MANGALORE RET RO'],
    'Madhya Pradesh' => ['BHOPAL RET RO', 'GWALIOR RETAIL REGIO', 'INDORE RET RO', 'JABALPUR RET RO'],
    'Odisha' => ['BHUBANESHWAR RET', 'SAMBALPUR RET RO'],
    'Chhattisgarh' => ['BILASPUR RET RO', 'RAIPUR RET RO'],
    'Punjab' => ['BATHINDA RET RO', 'JALANDHAR RET RO'],
    'Chandigarh' => ['CHANDIGARH RET RO'],
    'Jammu and Kashmir' => ['JAMMU & KASHMIR RET'],
    'Himachal Pradesh' => ['SHIMLA RET RO'],
    'Kerala' => ['COCHIN RET RO', 'KOZHICODE RET'],
    'West Bengal' => ['DURGAPUR RET RO', 'KOLKATA RET RO', 'SILIGURI RET RO'],
    'Assam' => ['GUWAHATI RET RO'],
    'Rajasthan' => ['JAIPUR RET RO', 'JODHPUR RET RO', 'KOTA RET RO', 'UDAIPUR RET RO'],
    'Uttar Pradesh' => ['AGRA RET RO', 'BAREILLY RETAIL REGI', 'KANPUR RET RO', 'MEERUT RET RO', 'GORAKHPUR RET RO', 'LUCKNOW RET RO', 'PRAYAGRAJ RETAIL REG', 'VARANASI RET RO'],
    'Uttarakhand' => ['DEHRADUN RET RO'],
    'Gujarat' => ['AHMEDABAD RET RO', 'BARODA RET RO', 'RAJKOT RET RO', 'SURAT RETAIL RO'],
    'Delhi' => ['DELHI RET RO'],
    'Haryana' => ['GURGAON RET RO', 'HISSAR RET RO', 'PANIPAT RET RO'],
    'Bihar' => ['BEGUSARAI RET RO', 'PATNA RET RO'],
    'Jharkhand' => ['DHANBAD RETAIL REGIO', 'RANCHI RET RO'],
    'Andhra Pradesh' => ['KADAPA RET RO', 'NELLORE RET RO', 'VIJAYAWADA RET RO', 'VISAKH RET RO'],
    'Telangana' => ['NIZAMABAD RETAIL REG', 'SECUNDRABAD RET RO', 'WARANGAL RET RO'],
    'Tamil Nadu' => ['CHENNAI RET RO', 'COIMBATORE RET RO', 'MADURAI RET RO', 'SALEM RET RO', 'TRICHY RET RO'],
    'Maharashtra' => ['AURANGABAD RET RO', 'MUMBAI RET RO', 'NAGPUR RET RO', 'NANDED RETAIL RO', 'NASIK RET RO', 'PUNE RET RO', 'SHOLAPUR RET RO', 'VASHI RET RO'],
    'Goa' => ['VASCO RET RO'],
];
const ORD_SHEET_ZONES = [
    'Bengaluru Zone' => ['zone' => 'Bengaluru Zone', 'ros' => ['BELGAUM RET RO', 'BELLARY RET RO', 'BENGALURU RET RO', 'GULBARGA RETAIL RO', 'MANGALORE RET RO']],
    'Bhopal Zone' => ['zone' => 'Central Zone', 'ros' => ['BHOPAL RET RO', 'GWALIOR RETAIL REGIO', 'INDORE RET RO', 'JABALPUR RET RO']],
    'Bhubaneswar Zone' => ['zone' => 'Central Zone', 'ros' => ['BHUBANESHWAR RET', 'BILASPUR RET RO', 'RAIPUR RET RO', 'SAMBALPUR RET RO']],
    'Chandigarh Zone' => ['zone' => 'Chandigarh Zone', 'ros' => ['BATHINDA RET RO', 'CHANDIGARH RET RO', 'JALANDHAR RET RO', 'JAMMU & KASHMIR RET', 'SHIMLA RET RO']],
    'Cochin Zone' => ['zone' => 'Cochin Zone', 'ros' => ['COCHIN RET RO', 'KOZHICODE RET']],
    'East Zone' => ['zone' => 'East Zone', 'ros' => ['DURGAPUR RET RO', 'KOLKATA RET RO', 'SILIGURI RET RO']],
    'Guwahati Zone' => ['zone' => 'Guwahati Zone', 'ros' => ['GUWAHATI RET RO']],
    'Jaipur Zone' => ['zone' => 'Jaipur Zone', 'ros' => ['JAIPUR RET RO', 'JODHPUR RET RO', 'KOTA RET RO', 'UDAIPUR RET RO']],
    'Noida (UP-West) Zone' => ['zone' => 'North Central Retail', 'ros' => ['AGRA RET RO', 'BAREILLY RETAIL REGI', 'DEHRADUN RET RO', 'KANPUR RET RO', 'MEERUT RET RO']],
    'North Central Retail' => ['zone' => 'North Central Retail', 'ros' => ['GORAKHPUR RET RO', 'LUCKNOW RET RO', 'PRAYAGRAJ RETAIL REG', 'VARANASI RET RO']],
    'North West Retail Zone' => ['zone' => 'North West Retail Zone', 'ros' => ['AHMEDABAD RET RO', 'BARODA RET RO', 'RAJKOT RET RO', 'SURAT RETAIL RO']],
    'North Zone' => ['zone' => 'North Zone', 'ros' => ['DELHI RET RO', 'GURGAON RET RO', 'HISSAR RET RO', 'PANIPAT RET RO']],
    'Patna Zone' => ['zone' => 'East Central Zone', 'ros' => ['BEGUSARAI RET RO', 'DHANBAD RETAIL REGIO', 'PATNA RET RO', 'RANCHI RET RO']],
    'South Central Retail' => ['zone' => 'South Central Retail', 'ros' => ['KADAPA RET RO', 'NELLORE RET RO', 'NIZAMABAD RETAIL REG', 'SECUNDRABAD RET RO', 'VIJAYAWADA RET RO', 'VISAKH RET RO', 'WARANGAL RET RO']],
    'South Zone' => ['zone' => 'South Zone', 'ros' => ['CHENNAI RET RO', 'COIMBATORE RET RO', 'MADURAI RET RO', 'SALEM RET RO', 'TRICHY RET RO']],
    'West Zone' => ['zone' => 'West Zone', 'ros' => ['AURANGABAD RET RO', 'MUMBAI RET RO', 'NAGPUR RET RO', 'NANDED RETAIL RO', 'NASIK RET RO', 'PUNE RET RO', 'SHOLAPUR RET RO', 'VASCO RET RO', 'VASHI RET RO']],
];

/**
* ORD_RO_SA: region => its sales areas (SA), straight from the client's FY27 sheet "Zone-State-RO-SA" (names tidied: extra spaces removed, repeats dropped).
* A Regional Officer handles ONE region and some of its sales areas - this is the list the pickers offer and the server checks against.
*/
const ORD_RO_SA = [
    'BELGAUM RET RO' => ['BAGALKOT RETAIL SA', 'BELGAUM-1 RETAIL SA', 'BELGAUM-2 RETAIL SA', 'GADAG RETAIL SA', 'HUBLI RETAIL SA'],
    'BELLARY RET RO' => ['BELLARY RETAIL SA', 'DAVANGERE RETAIL SA', 'TUMKUR RETAIL SA'],
    'BENGALURU RET RO' => ['BENGALURU-1 RETAIL', 'BENGALURU-2 RETAIL', 'BENGALURU-3 RETAIL', 'KOLAR RETAIL SA', 'MANDYA RETAIL SA'],
    'GULBARGA RETAIL RO' => ['BIJAPUR RETAIL SA', 'GULBARGA RETAIL SA', 'GULBARGA-2 RETAIL SA', 'RAICHUR RETAIL SA'],
    'MANGALORE RET RO' => ['HASSAN RETAIL SA', 'MANGALORE RETAIL SA', 'MYSURU RETAIL SA', 'SHIMOGA RETAIL SA', 'UDUPI RETAIL SA'],
    'BHOPAL RET RO' => ['BETUL RETAIL SA', 'BHOPAL RETAIL SA', 'RAISEN RETAIL SA', 'SEHORE RETAIL SA', 'VIDISHA RETAIL SA'],
    'GWALIOR RETAIL REGIO' => ['GUNA RETAIL SA', 'GWALIOR RETAIL SA', 'GWALIOR-II RETAIL SA'],
    'INDORE RET RO' => ['DHAR RETAIL SA', 'INDORE-1 RETAIL SA', 'INDORE-2 RETAIL SA', 'KHANDWA RETAIL SA', 'MANDSAUR RETAIL SA', 'RATLAM RETAIL SA', 'UJJAIN RETAIL SA'],
    'JABALPUR RET RO' => ['BALAGHAT RETAIL SA', 'CHHINDWARA RETAIL SA', 'JABALPUR RETAIL SA', 'KATNI RETAIL SA', 'REWA RETAIL SA', 'SAGAR RETAIL SA', 'SATNA RETAIL SA'],
    'BHUBANESHWAR RET' => ['ANGUL RETAIL SA', 'BALASORE RETAIL SA', 'BHUBANESHWAR RETAIL', 'CUTTACK RETAIL SA'],
    'BILASPUR RET RO' => ['AMBIKAPUR RETAIL SA', 'BILASPUR RETAIL SA', 'KORBA RETAIL SA', 'RAIGARH RETAIL SA'],
    'RAIPUR RET RO' => ['DURG RETAIL SA', 'JAGDALPUR RETAIL SA', 'RAIPUR-1 RETAIL SA', 'RAIPUR-2 RETAIL SA', 'RAJNANDGAON RETAIL'],
    'SAMBALPUR RET RO' => ['BHAWANIPATANA RETAIL', 'ROURKELA RETAIL SA', 'SAMBALPUR RETAIL SA'],
    'BATHINDA RET RO' => ['ABOHAR RETAIL SA', 'BATHINDA RETAIL SA', 'FARIDKOT RETAIL SA', 'FIROZPUR RETAIL SA', 'MANSA RETAIL SA', 'MOGA RETAIL SA'],
    'CHANDIGARH RET RO' => ['CHANDIGARH RETAIL SA', 'LUDHIANA-1 RETAIL SA', 'LUDHIANA-2 RETAIL SA', 'PATIALA RETAIL SA', 'RUPNAGAR RETAIL SA', 'SANGRUR RETAIL SA'],
    'JALANDHAR RET RO' => ['AMRITSAR-1 RETAIL SA', 'AMRITSAR-2 RETAIL SA', 'HOSHIARPUR RETAIL SA', 'JALANDHAR-1 RETAIL', 'JALANDHAR-2 RETAIL', 'PATHANKOT RETAIL SA'],
    'JAMMU & KASHMIR RET' => ['JAMMU-1 RETAIL SA', 'JAMMU-2 RETAIL SA', 'SRINAGAR-1 RETAIL', 'SRINAGAR-2 RETAIL'],
    'SHIMLA RET RO' => ['KANGRA RETAIL SA', 'NALAGARH RETAIL SA', 'SHIMLA RETAIL SA'],
    'COCHIN RET RO' => ['ALLEPEY RETAIL SA', 'ERNAKULAM RETAIL SA', 'KOLLAM RETAIL SA', 'KOTTAYAM RETAIL SA', 'MUVATTUPUZHA RETAIL', 'TRIVANDRUM RETAIL SA'],
    'KOZHICODE RET' => ['KANNUR RETAIL SA', 'KOZHIKODE RETAIL SA', 'MANJERI RETAIL SA', 'PALAKKAD RETAIL SA', 'THRISSUR RETAIL SA', 'TIRUR RETAIL SA'],
    'DURGAPUR RET RO' => ['ASANSOL RETAIL SA', 'DURGAPUR RETAIL SA', 'HOOGHLY RETAIL SA', 'KHARAGPUR RETAIL SA'],
    'KOLKATA RET RO' => ['BARASAT RETAIL SA', 'HOWRAH RETAIL SA', 'KOLKATA-2 RETAIL SA', 'KOLKATA-3 RETAIL SA'],
    'SILIGURI RET RO' => ['MURSHIDABAD RETAIL', 'SILIGURI RETAIL SA'],
    'GUWAHATI RET RO' => ['GUWAHATI-1 RETAIL SA', 'GUWAHATI-2 RETAIL SA', 'JORHAT RETAIL SA', 'SHILONG RETAIL SA', 'SILCHAR RETAIL SA'],
    'JAIPUR RET RO' => ['ALWAR RETAIL SA', 'BHARATPUR RETAIL SA', 'JAIPUR C RETAIL SA', 'JAIPUR-1 RETAIL SA', 'JAIPUR-2 RETAIL SA', 'SIKAR RETAIL SA', 'SRIGANGANAGAR RETAIL'],
    'JODHPUR RET RO' => ['BARMER RETAIL SA', 'BIKANER RETAIL SA', 'DIDWANA RETAIL SA', 'JODHPUR A RETAIL SA', 'JODHPUR-2 RETAIL SA', 'NAGAUR RETAIL SA'],
    'KOTA RET RO' => ['AJMER RETAIL SA', 'JHALAWAR RETAIL SA', 'KOTA RETAIL SA', 'SAWAI MADHOPUR RETAL', 'TONK RETAIL SA'],
    'UDAIPUR RET RO' => ['BHILWARA RETAIL SA', 'CHITTORGARH RETAIL', 'PALI RETAIL SA', 'SIROHI RETAIL SA', 'UDAIPUR RETAIL SA'],
    'AGRA RET RO' => ['AGRA RETAIL SA', 'ALIGARH RETAIL SA', 'ETAH RETAIL SA', 'FIROZABAD RETAIL SA', 'MATHURA RETAIL SA'],
    'BAREILLY RETAIL REGI' => ['BADAUN RETAIL SA', 'BAREILLY RETAIL SA', 'MORADABAD RETAIL SA', 'SHAHAJAHANPUR RETAIL'],
    'DEHRADUN RET RO' => ['DEHRADUN RETAIL SA', 'HALDWANI RETAIL SA', 'ROORKEE RETAIL SA', 'US NAGAR RETAIL SA'],
    'KANPUR RET RO' => ['ETAWAH RETAIL SA', 'JHANSI RETAIL SA', 'KANPUR DEHAT RETAIL', 'KANPUR RETAIL SA', 'UNNAO RETAIL SA'],
    'MEERUT RET RO' => ['BIJNOR RETAIL SA', 'MEERUT RETAIL SA', 'NOIDA RETAIL SA', 'SAHARANPUR RETAIL SA'],
    'GORAKHPUR RET RO' => ['BASTI RETAIL SA', 'DEORIA RETAIL SA', 'GONDA RETAIL SA', 'GORAKHPUR RETAIL SA', 'KUSHINAGAR RETAIL SA'],
    'LUCKNOW RET RO' => ['AYODHYA RETAIL SA', 'HARDOI RETAIL SA', 'LAKHIMPUR KHERI RET', 'LUCKNOW RETAIL SA', 'SITAPUR RETAIL SA'],
    'PRAYAGRAJ RETAIL REG' => ['ALLAHABAD RETAIL SA', 'FATEHPUR RETAIL SA', 'PRAYAGRAJ-2 RETAIL S', 'RAI BARELI RETAIL SA', 'SULTANPUR RETAIL SA'],
    'VARANASI RET RO' => ['AZAMGARH RETAIL SA', 'MIRZAPUR RETAIL SA', 'SONBHADRA RETAIL SA', 'VARANASI RETAIL SA'],
    'AHMEDABAD RET RO' => ['AHMEDABAD-1 RETAIL', 'AHMEDABAD-2 RETAIL', 'BANASKANTHA RETAIL', 'BHAVNAGAR RETAIL SA', 'GANDHINAGAR RETAIL', 'MEHSANA RETAIL SA', 'PATAN RETAIL SA', 'SURENDRANAGAR RETAIL'],
    'BARODA RET RO' => ['ANAND RETAIL SA', 'BARODA RETAIL SA', 'BHARUCH RETAIL SA', 'GODHRA RETAIL SA'],
    'RAJKOT RET RO' => ['AMRELI RETAIL SA', 'GANDHIDHAM RETAIL SA', 'JAMNAGAR RETAIL SA', 'PORBANDAR RETAIL SA', 'RAJKOT RETAIL SA'],
    'SURAT RETAIL RO' => ['SURAT RETAIL SA', 'SURAT-2 RETAIL SA', 'VAPI RETAIL SA'],
    'DELHI RET RO' => ['DELHI-2 RETAIL SA', 'DELHI-3 RETAIL SA', 'DELHI-4 RETAIL SA'],
    'GURGAON RET RO' => ['FARIDABAD RETAIL SA', 'GURGAON-1 RETAIL SA', 'GURGAON-2 RETAIL SA', 'REWARI RETAIL SA', 'ROHTAK RETAIL SA'],
    'HISSAR RET RO' => ['BHIWANI RETAIL SA', 'HISAR RETAIL SA', 'JIND RETAIL SA', 'SIRSA RETAIL SA'],
    'PANIPAT RET RO' => ['AMBALA RETAIL SA', 'KARNAL RETAIL SA', 'KURUKSHETRA RET SA', 'PANIPAT RETAIL SA', 'YAMUNA NAGAR RETAIL'],
    'BEGUSARAI RET RO' => ['BEGUSARAI RETAIL SA', 'CHAMPARAN RETAIL SA', 'MADUBANI RETAIL SA', 'MUZAFFARPUR RETAIL', 'PURNIA RETAIL SA'],
    'DHANBAD RETAIL REGIO' => ['DEOGHAR RETAIL SA', 'DHANBAD RETAIL SA', 'HAZARIBAGH RETAIL SA'],
    'PATNA RET RO' => ['BHAGALPUR RETAIL SA', 'BHOJPUR RETAIL SA', 'GAYA RETAIL SA', 'PATNA RETAIL SA', 'ROHTAS RETAIL SA', 'SIWAN RETAIL SA'],
    'RANCHI RET RO' => ['DALTONGANJ RETAIL SA', 'RANCHI RETAIL SA', 'TATANAGAR RETAIL SA'],
    'KADAPA RET RO' => ['ANANTAPUR-1 RETAIL', 'ANANTAPUR-2 RETAIL', 'KADAPA RETAIL SA', 'KURNOOL RETAIL SA', 'NANDYAL RETAIL SA'],
    'NELLORE RET RO' => ['CHITTOOR RETAIL SA', 'NELLORE RETAIL SA', 'ONGOLE-1 RETAIL SA', 'ONGOLE-2 RETAIL SA', 'TIRUPATI RETAIL SA'],
    'NIZAMABAD RETAIL REG' => ['ADILABAD RETAIL SA', 'MEDAK RETAIL SA', 'NIZAMABAD RETAIL SA', 'RAMAGUNDAM RETAIL SA'],
    'SECUNDRABAD RET RO' => ['HYDERABAD-1 RETAIL', 'HYDERABAD-2 RETAIL', 'HYDERABAD-3 RETAILSA', 'HYDERABAD-4 RETAIL', 'MAHBUBNAGAR RETAIL', 'SANGAREDDY RETAIL SA', 'WANAPARTHY RETAIL SA'],
    'VIJAYAWADA RET RO' => ['AMARAVATI RETAIL SA', 'BHIMAVARAM RETAIL SA', 'ELURU RETAIL SA', 'GUNTUR RETAIL SA', 'MACHILIPATNAM RET SA', 'VIJAYAWADA-1 RETAIL'],
    'VISAKH RET RO' => ['ANAKAPALLE RETAIL SA', 'KAKINADA RETAIL SA', 'RAJAHMUNDRY RETAIL', 'VISAKH RETAIL SA', 'VIZIANAGARAM RETAIL'],
    'WARANGAL RET RO' => ['KARIMNAGAR RETAIL SA', 'KHAMMAM RETAIL SA', 'KOTHAGUDEM RETAIL SA', 'NALGONDA-1 RETAIL SA', 'NALGONDA-2 RETAIL SA', 'SIDDIPET RETAIL SA', 'WARRANGAL RETAIL SA'],
    'CHENNAI RET RO' => ['CHENNAI RETAIL SA', 'KANCHIPURAM RETAIL', 'THIRUVALLUR-1 RETAIL', 'THIRUVALLUR-2 RETAIL', 'TIRUVANNAMALAI RETAL', 'VELLORE RETAIL SA'],
    'COIMBATORE RET RO' => ['COIMBATORE-1 RETAIL', 'COIMBATORE-2 RETAIL', 'ERODE RETAIL SA', 'ERODE-2 RETAIL SA', 'TIRUPUR RETAIL SA'],
    'MADURAI RET RO' => ['DINDIGUL RETAIL SA', 'KANYAKUMARI RETAIL', 'MADURAI RETAIL SA', 'RAMNAD RETAIL SA', 'TIRUNELVELLI RETAIL', 'TUTICORIN RETAIL SA'],
    'SALEM RET RO' => ['KRISHNAGIRI RETAIL', 'NAMAKKAL RETAIL SA', 'SALEM-1 RETAIL SA', 'SALEM-2 RETAIL SA'],
    'TRICHY RET RO' => ['CUDDALORE RETAIL SA', 'NAGAPATTINAM RETAIL', 'PONDICHERRY RETAIL', 'TANJORE RETAIL SA', 'TRICHY RETAIL SA', 'VELLUPURAM RETAIL SA'],
    'AURANGABAD RET RO' => ['AHMEDNAGAR RETAIL SA', 'AURANGABAD-1 RETAIL', 'AURANGABAD-2 RETAIL', 'JALNA RETAIL SA', 'SHIRDI RETAIL SA'],
    'MUMBAI RET RO' => ['MUMBAI-1 RETAIL SA', 'MUMBAI-2 RETAIL SA', 'MUMBAI-3 RETAIL SA'],
    'NAGPUR RET RO' => ['AMRAVATI RETAIL SA', 'CHANDRAPUR RETAIL SA', 'GONDIA RETAIL SA', 'NAGPUR-1 RETAIL SA', 'NAGPUR-2 RETAIL SA'],
    'NANDED RETAIL RO' => ['AKOLA RETAIL SA', 'LATUR RETAIL SA', 'NANDED RETAIL SA', 'PARBHANI RETAIL SA', 'YAVATMAL RETAIL SA'],
    'NASIK RET RO' => ['DHULE RETAIL SA', 'JALGAON RETAIL SA', 'MANMAD RETAIL SA', 'NASIK-1 RETAIL SA', 'NASIK-2 RETAIL SA'],
    'PUNE RET RO' => ['CHAKAN RETAIL SA', 'PUNE-1 RETAIL SA', 'PUNE-2 RETAIL SA', 'PUNE-3 RETAIL SA', 'PUNE-4 RETAIL SA', 'SATARA RETAIL SA'],
    'SHOLAPUR RET RO' => ['BEED RETAIL SA', 'PANDHARPUR RETAIL SA', 'SANGLI RETAIL SA', 'SHOLAPUR RETAIL SA', 'SHOLAPUR-2 RETAIL SA'],
    'VASCO RET RO' => ['KOLHAPUR RETAIL SA', 'RATNAGIRI RETAIL SA', 'VASCO RETAIL SA'],
    'VASHI RET RO' => ['THANE-1 RETAIL SA', 'THANE-2 RETAIL SA', 'VASHI RETAIL SA', 'VASHI-2 RETAIL SA'],
];

/**
 * The client's zone -> state listing used to pick the states a super admin approves (a state can appear under several zones: it is one state).
 * Spelling follows the outlet list (portal_outlets.state), because an order's state decides who approves it.
 */
const ORD_SHEET_STATES = [
    'Bengaluru Zone' => ['Karnataka'],
    'Bhopal Zone' => ['Madhya Pradesh'],
    'Bhubaneswar Zone' => ['Chhattisgarh', 'Odisha'],
    'Chandigarh Zone' => ['Chandigarh', 'Himachal Pradesh', 'Jammu and Kashmir', 'Ladakh', 'Punjab'],
    'Cochin Zone' => ['Kerala', 'Pondicherry'],
    'East Zone' => ['Manipur', 'Mizoram', 'Sikkim', 'West Bengal'],
    'Guwahati Zone' => ['Arunachal Pradesh', 'Assam', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Tripura'],
    'Jaipur Zone' => ['Rajasthan'],
    'Noida (UP-West) Zone' => ['Uttar Pradesh', 'Uttarakhand'],
    'North Zone' => ['Delhi', 'Haryana', 'Rajasthan'],
    'North Central Retail' => ['Uttar Pradesh'],
    'North West Retail Zone' => ['Dadra & Nagar', 'Gujarat'],
    'Patna Zone' => ['Bihar', 'Jharkhand'],
    'South Zone' => ['Pondicherry', 'Tamil Nadu'],
    'South Central Retail' => ['Andhra Pradesh', 'Pondicherry', 'Telangana'],
    'West Zone' => ['Goa', 'Maharashtra'],
];
/** Every state of that listing, once each. */
function approvalStateList(): array {
    return array_values(array_unique(array_merge(...array_values(ORD_SHEET_STATES))));
}

/**
 * The states whose pending orders a super admin approves (stored as 'states' on the account). Empty = every state.
 * Accounts made with the older zone / region picker have no 'states': theirs are worked out from the regions (or zones) they were given.
 */
function approvalStates(array $u): array {
    $all = approvalStateList();
    $s = array_values(array_intersect($all, array_map('strval', (array)($u['states'] ?? []))));
    if ($s) return count($s) === count($all) ? [] : $s;
    $ros = array_map('strval', (array)($u['ros'] ?? []));
    if ($ros) {
        foreach (ORD_STATE_RO as $st => $rs) if (array_intersect($rs, $ros)) $s[] = $st;
    } else {
        foreach ((array)($u['zones'] ?? []) as $z) foreach (ORD_ZONES[$z] ?? [] as $st) $s[] = $st;
    }
    $s = array_values(array_unique($s));
    return count(array_intersect(array_keys(ORD_STATE_RO), $s)) === count(ORD_STATE_RO) ? [] : $s;   // every state of the old list = everything
}
