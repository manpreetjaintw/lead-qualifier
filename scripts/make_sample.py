"""Generate the demo dataset (public/sample-leads.csv) and its simulated network fixtures (src/lib/sample.ts).

All companies, people and domains are fictional. The CSV mimics a messy SaaSquatch / Apollo / Google Maps
export: inconsistent casing, duplicate companies from different sources, typo'd and generic emails.
"""
import csv, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
H = ["Company Name","Website","Owner Name","Title","Email","Phone","Industry","City","State","Country","Employees","Est. Revenue","Founded","LinkedIn","Source"]
rows = [
 ["Brightline HVAC Services","brightlinehvac.com","Gary Whitfield","Owner","gary@brightlinehvac.com","(614) 555-0182","HVAC","Columbus","OH","USA","28","$4.2M","1994","linkedin.com/company/brightline-hvac","Google Maps"],
 ["BRIGHTLINE HVAC SERVICES LLC","https://www.brightlinehvac.com/","Gary Whitfield","","info@brightlinehvac.com","614.555.0182","HVAC","Columbus","OH","US","25-30","","","","Apollo"],
 ["Keystone Bookkeeping & Tax","keystonebooks.com","Linda Moreau","Founder & CEO","linda.moreau@keystonebooks.com","+1 412 555 0147","Accounting","Pittsburgh","PA","USA","12","$1.8M","2001","","SaaSquatch"],
 ["Keystone Bookkeeping and Tax Inc.","keystonebooks.com","L. Moreau","President","linda@keystonebooks.com","4125550147","Bookkeeping","Pittsburgh","PA","USA","","1.8 million","2001","linkedin.com/company/keystone-books","Crunchbase"],
 ["Riverbend Pest Control","riverbendpest.com","Tom Alvarez","Owner","tom.alvarez@gmial.com","(512) 555-0193","Pest Control","Austin","TX","USA","9","$950K","2009","","Google Maps"],
 ["Summit Ridge Landscaping","summitridgelandscape.com","Dana Kirk","Co-Owner","dana@summitridgelandscape.com","(303) 555-0111","Landscaping","Denver","CO","USA","40","$6.5M","1998","","SaaSquatch"],
 ["Harbor Point Logistics","harborpointlogistics.com","Michael Chen","VP Operations","mchen@harborpointlogistics.com","(757) 555-0166","Logistics","Norfolk","VA","USA","85","$18M","2005","linkedin.com/company/harbor-point","Apollo"],
 ["Precision Tool & Die Co","precisiontooldie.com","Robert Hale","President","rhale@precisiontooldie.com","(616) 555-0122","Manufacturing","Grand Rapids","MI","USA","52","$11M","1978","","Crunchbase"],
 ["Precision Tool and Die","precisiontooldie.com","Bob Hale","Owner","","616-555-0122","Manufacturing","Grand Rapids","MI","USA","50","","1978","","Google Maps"],
 ["Lakeside Dental Group","lakesidedentalgroup.com","Dr. Priya Shah","Owner","frontdesk@lakesidedentalgroup.com","(608) 555-0175","Dental","Madison","WI","USA","18","$3.1M","2007","","Google Maps"],
 ["Copperline Electrical","copperlineelectric.com","Sam Ortiz","Owner","sam@copperlineelectric.com","(602) 555-0139","Electrical","Phoenix","AZ","USA","22","$3.9M","2003","","SaaSquatch"],
 ["Nimbus Cloud Analytics","nimbuscloudhq.io","Ava Patel","Head of Growth","ava@nimbuscloudhq.io","(415) 555-0108","Software","San Francisco","CA","USA","140","$22M","2019","linkedin.com/company/nimbus-cloud","Apollo"],
 ["Greenfield Home Health","greenfieldhomehealth.com","Karen Doyle","Administrator","karen@greenfield-hh.net","(317) 555-0150","Home Health","Indianapolis","IN","USA","65","$7.4M","2004","","Crunchbase"],
 ["Old Mill Roofing","oldmillroofing.com","Jim Becker","Owner","jbecker1958@aol.com","(419) 555-0187","Roofing","Toledo","OH","USA","14","$2.2M","1986","","Google Maps"],
 ["Atlas Staffing Partners","atlasstaffingpartners.com","Monique Grant","Managing Partner","mgrant@atlasstaffingpartners.com","(404) 555-0129","Staffing","Atlanta","GA","USA","33","$9.8M","2011","linkedin.com/company/atlas-staffing","Apollo"],
 ["Quickfix Phone Repair","quickfixphones.biz","","","sales@quickfixphones.biz","555-01","Retail","Miami","FL","USA","3","$180K","2022","","Google Maps"],
 ["Blue Ridge Veterinary Clinic","blueridgevet.com","Dr. Elaine Foster","Owner","elaine@blueridgevet.com","(828) 555-0164","Veterinary","Asheville","NC","USA","16","$2.7M","1999","","SaaSquatch"],
 ["Ironclad Trucking","ironcladtrucking.com","Wes Duncan","Owner","dispatch@ironcladtrucking.com","(918) 555-0198","Trucking","Tulsa","OK","USA","47","$12.5M","1992","","Google Maps"],
 ["Ironclad Trucking Inc","ironcladtrucking.com","Wesley Duncan","Owner / President","wes.duncan@ironcladtrucking.com","+19185550198","Trucking","Tulsa","OK","USA","","$12M","1992","linkedin.com/company/ironclad-trucking","Apollo"],
 ["Pixel & Pine Marketing","pixelandpine.co","Jordan Lee","Founder","jordan@pixelandpine.co","(503) 555-0115","Marketing","Portland","OR","USA","7","$650K","2020","","SaaSquatch"],
 ["Coastal Janitorial Solutions","coastaljanitorial.com","Rosa Mendez","Owner","rosa@mailinator.com","(843) 555-0142","Janitorial","Charleston","SC","USA","60","$3.4M","2006","","Google Maps"],
 ["Meridian IT Services","meridianitservices.com","Paul Novak","CEO","paul.novak@meridianitservices.com","(952) 555-0177","IT Services","Minneapolis","MN","USA","38","$6.1M","2008","linkedin.com/company/meridian-it","Apollo"],
 ["Sunset Bakery","sunsetbakeryla.com","Mia Torres","Manager","mia.torres@@sunsetbakery","(323) 555-0103","Restaurant","Los Angeles","CA","USA","6","$400K","2016","","Google Maps"],
 ["Granite State Insurance Agency","granitestateins.com","Frank Russo","Principal Agent","frank@granitestateins.com","(603) 555-0136","Insurance","Manchester","NH","USA","11","$1.4M","1983","","SaaSquatch"],
 ["Vertex Engineering Group","vertexeng-group.com","Hannah Kim","Director of Engineering","hkim@vertexeng-group.com","(713) 555-0158","Engineering","Houston","TX","USA","95","$19M","1997","linkedin.com/company/vertex-engineering","Crunchbase"],
 ["Prairie Wind Plumbing","prairiewindplumbing.com","Dale Swenson","Owner","dale@prairiewindplumbing.com","(605) 555-0181","Plumbing","Sioux Falls","SD","USA","19","$2.9M","1990","","Google Maps"],
 ["Prairie Wind Plumbing & Heating","prairiewindplumbing.com","","","office@prairiewindplumbing.com","(605) 555-0181","Plumbing","Sioux Falls","SD","USA","","","","","SaaSquatch"],
 ["MegaCorp Distribution","megacorpdist.com","Linda Park","Procurement Specialist","lpark@megacorpdist.com","(214) 555-0140","Distribution","Dallas","TX","USA","2400","$640M","1972","linkedin.com/company/megacorp","Apollo"],
 ["Evergreen Lab Services","evergreenlabs.com","Nathan Brooks","Owner","nathan@evergreenlabs.com","(206) 555-0127","Laboratory","Seattle","WA","USA","24","$5.2M","2002","","Crunchbase"],
 ["Tidewater Marine Supply","tidewatermarine.com","Carl Jensen","Owner","carl@tidewatermarine.com","(410) 555-0189","Retail","Annapolis","MD","USA","8","$1.1M","1981","","Google Maps"],
 ["Foxglove Florist","foxgloveflowers.net","Emma Hart","Owner","emma.hart@yahoo.com","(802) 555-0124","Florist","Burlington","VT","USA","4","$300K","2014","","Google Maps"],
 ["Redwood Accounting Partners","redwoodcpas.com","Steven Wu","Managing Partner","steven@redwoodcpas.com","(916) 555-0161","Accounting","Sacramento","CA","USA","26","$4.6M","1995","linkedin.com/company/redwood-cpas","SaaSquatch"],
 ["Bayou Construction Co","bayouconstruction.com","Andre Thibodeaux","President","andre@bayouconstruction.com","(225) 555-0133","Construction","Baton Rouge","LA","USA","72","$15M","1988","","Apollo"],
 ["Northstar Managed Services","northstarmsp.com","Ellen Price","COO","noreply@northstarmsp.com","(651) 555-0119","Managed Services","St. Paul","MN","USA","31","$5.5M","2010","","Apollo"],
 ["Silverleaf Engineering","silverleafeng.com","Raj Mehta","Owner","raj@silverleafeng.com","(919) 555-0172","Engineering","Raleigh","NC","USA","15","$2.4M","2012","","Crunchbase"],
]
with open(ROOT/"public/sample-leads.csv","w",newline="") as f:
    w=csv.writer(f); w.writerow(H); w.writerows(rows)

# Simulated network results for the demo (clearly labelled "simulated" in the UI).
Y=2026
def site(status="live", title=None, cr=None, since=None, socials=(), hiring=False, desc=None):
    d={"status":status,"socials":list(socials)}
    if title: d["title"]=title
    if desc: d["description"]=desc
    if cr: d["copyrightYear"]=cr
    if since: d["sinceYear"]=since
    if hiring: d["hiring"]=True
    return d
net={
 "brightlinehvac.com":{"mx":True,"website":site(title="Brightline HVAC | Heating & Cooling in Columbus",cr=2019,since=1994,socials=["facebook"],desc="Family-owned heating and cooling since 1994.")},
 "keystonebooks.com":{"mx":True,"website":site(title="Keystone Bookkeeping & Tax",cr=2021,socials=["linkedin"])},
 "riverbendpest.com":{"mx":True,"website":site(title="Riverbend Pest Control Austin",cr=2025)},
 "summitridgelandscape.com":{"mx":True,"website":site(title="Summit Ridge Landscaping, Denver",cr=2020,since=1998,socials=["facebook","instagram"])},
 "harborpointlogistics.com":{"mx":True,"website":site(title="Harbor Point Logistics",cr=2026,socials=["linkedin"],hiring=True)},
 "precisiontooldie.com":{"mx":True,"website":site(title="Precision Tool & Die | Since 1978",cr=2016,since=1978)},
 "lakesidedentalgroup.com":{"mx":True,"website":site(title="Lakeside Dental Group",cr=2025,socials=["facebook"])},
 "copperlineelectric.com":{"mx":True,"website":site(title="Copperline Electrical Contractors",cr=2022)},
 "nimbuscloudhq.io":{"mx":True,"website":site(title="Nimbus: Cloud analytics for modern teams",cr=2026,socials=["linkedin","x"],hiring=True)},
 "greenfieldhomehealth.com":{"mx":True,"website":site(title="Greenfield Home Health Care",cr=2024)},
 "greenfield-hh.net":{"mx":True},
 "oldmillroofing.com":{"mx":False,"website":site(status="dead")},
 "atlasstaffingpartners.com":{"mx":True,"website":site(title="Atlas Staffing Partners",cr=2026,socials=["linkedin"],hiring=True)},
 "quickfixphones.biz":{"mx":False,"website":site(status="dead")},
 "blueridgevet.com":{"mx":True,"website":site(title="Blue Ridge Veterinary Clinic, Asheville",cr=2018,since=1999,socials=["facebook"])},
 "ironcladtrucking.com":{"mx":True,"website":site(title="Ironclad Trucking | Tulsa freight since 1992",cr=2017,since=1992,socials=["linkedin"],hiring=True)},
 "pixelandpine.co":{"mx":True,"website":site(title="Pixel & Pine",cr=2026,socials=["instagram","linkedin"])},
 "coastaljanitorial.com":{"mx":True,"website":site(title="Coastal Janitorial Solutions",cr=2023)},
 "meridianitservices.com":{"mx":True,"website":site(title="Meridian IT | Managed IT for Minnesota businesses",cr=2025,socials=["linkedin"])},
 "sunsetbakeryla.com":{"mx":True,"website":site(title="Sunset Bakery",cr=2024,socials=["instagram"])},
 "granitestateins.com":{"mx":True,"website":site(title="Granite State Insurance Agency",cr=2015,since=1983)},
 "vertexeng-group.com":{"mx":True,"website":site(title="Vertex Engineering Group",cr=2026,socials=["linkedin"],hiring=True)},
 "prairiewindplumbing.com":{"mx":True,"website":site(title="Prairie Wind Plumbing & Heating",cr=2018,since=1990)},
 "megacorpdist.com":{"mx":True,"website":site(title="MegaCorp Distribution",cr=2026,socials=["linkedin","x","youtube"],hiring=True)},
 "evergreenlabs.com":{"mx":True,"website":site(title="Evergreen Lab Services",cr=2021)},
 "tidewatermarine.com":{"mx":True,"website":site(title="Tidewater Marine Supply",cr=2012,since=1981)},
 "foxgloveflowers.net":{"mx":True,"website":site(title="Foxglove Florist",cr=2025,socials=["instagram"])},
 "redwoodcpas.com":{"mx":True,"website":site(title="Redwood Accounting Partners, CPAs",cr=2024,socials=["linkedin"])},
 "bayouconstruction.com":{"mx":True,"website":site(title="Bayou Construction Co.",cr=2020,since=1988)},
 "northstarmsp.com":{"mx":True,"website":site(title="Northstar Managed Services",cr=2025)},
 "silverleafeng.com":{"mx":True,"website":site(title="Silverleaf Engineering",cr=2023)},
}
(ROOT/"src/lib/sample.ts").write_text(
 "// Generated by scripts/make_sample.py. Simulated network results for the fictional demo dataset.\n"
 "import type { NetworkCheck } from \"./types\";\n\n"
 "export const SAMPLE_CSV_URL = \"/sample-leads.csv\";\n\n"
 f"export const DEMO_NETWORK: Record<string, Partial<NetworkCheck> & {{ mx?: boolean }}> = {json.dumps(net, indent=2)};\n")
print(len(rows),"rows")
