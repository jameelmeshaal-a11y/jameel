// Data types for the construction cost estimation system

export interface Project {
  id: string;
  name: string;
  cities: string[];
  status: 'active' | 'archived' | 'draft';
  boqCount: number;
  totalValue: number;
  lastUpdated: string;
  createdAt: string;
}

export interface BoQItem {
  id: string;
  itemNo: string;
  description: string; // Arabic
  descriptionEn: string; // Internal English translation
  unit: string;
  quantity: number;
  // Pricing columns (added by system)
  unitRate?: number;
  totalPrice?: number;
  materials?: number;
  labor?: number;
  equipment?: number;
  logistics?: number;
  risk?: number;
  profit?: number;
  notes?: string;
  confidence?: number; // 0-100
  status: 'pending' | 'approved' | 'review' | 'conflict';
  source?: 'library' | 'ai' | 'manual';
  locationFactor?: number;
}

export interface RateLibraryItem {
  id: string;
  code: string;
  descriptionEn: string;
  descriptionAr: string;
  unit: string;
  baseRate: number;
  materials: number;
  labor: number;
  equipment: number;
  category: string;
  lastUsed: string;
  usageCount: number;
}

export interface ProjectDocument {
  id: string;
  name: string;
  type: 'core' | 'technical' | 'other';
  fileType: string;
  size: string;
  uploadedAt: string;
}

// All data arrays start empty — no demo/mock/seed data
export const sampleProjects: Project[] = [];
export const sampleBoQItems: BoQItem[] = [];
export const sampleRateLibrary: RateLibraryItem[] = [];
export const sampleDocuments: ProjectDocument[] = [];

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-SA', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 }).format(value);
};

export const formatNumber = (value: number, decimals = 2): string => {
  return new Intl.NumberFormat('en-SA', { maximumFractionDigits: decimals }).format(value);
};
