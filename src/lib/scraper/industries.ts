/**
 * Industries the scraper can collect, mapped to the OpenStreetMap tags that identify them.
 * Labels deliberately match the scoring presets' industry keywords (see pipeline/score.ts).
 */
export interface Industry {
  id: string;
  label: string;
  tags: [key: string, value: string][];
}

export const INDUSTRIES: Industry[] = [
  { id: "accounting", label: "Accounting", tags: [["office", "accountant"], ["office", "tax_advisor"]] },
  { id: "architecture", label: "Architecture", tags: [["office", "architect"]] },
  { id: "auto-repair", label: "Auto Repair", tags: [["shop", "car_repair"]] },
  { id: "construction", label: "Construction", tags: [["office", "construction_company"], ["craft", "builder"]] },
  { id: "dental", label: "Dental", tags: [["amenity", "dentist"], ["healthcare", "dentist"]] },
  { id: "electrical", label: "Electrical", tags: [["craft", "electrician"]] },
  { id: "engineering", label: "Engineering", tags: [["office", "engineer"]] },
  { id: "hvac", label: "HVAC", tags: [["craft", "hvac"]] },
  { id: "insurance", label: "Insurance", tags: [["office", "insurance"]] },
  { id: "it-services", label: "IT Services", tags: [["office", "it"]] },
  { id: "landscaping", label: "Landscaping", tags: [["craft", "gardener"], ["craft", "landscaper"]] },
  { id: "legal", label: "Legal", tags: [["office", "lawyer"]] },
  { id: "marketing", label: "Marketing", tags: [["office", "advertising_agency"]] },
  { id: "plumbing", label: "Plumbing", tags: [["craft", "plumber"]] },
  { id: "real-estate", label: "Real Estate", tags: [["office", "estate_agent"]] },
  { id: "roofing", label: "Roofing", tags: [["craft", "roofer"]] },
  { id: "veterinary", label: "Veterinary", tags: [["amenity", "veterinary"]] },
];

export const industryById = (id: string) => INDUSTRIES.find((i) => i.id === id);
