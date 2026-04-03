// Mock data types and sample data for the construction cost estimation system

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

export const sampleProjects: Project[] = [
  {
    id: '1',
    name: 'مشروع مدينة نيوم - المرحلة الأولى',
    cities: ['تبوك'],
    status: 'active',
    boqCount: 3,
    totalValue: 2450000000,
    lastUpdated: '2025-03-28',
    createdAt: '2025-01-15',
  },
  {
    id: '2',
    name: 'توسعة مطار الملك عبدالعزيز',
    cities: ['جدة'],
    status: 'active',
    boqCount: 5,
    totalValue: 890000000,
    lastUpdated: '2025-03-25',
    createdAt: '2025-02-01',
  },
  {
    id: '3',
    name: 'مشروع قطار الحرمين - محطات جديدة',
    cities: ['مكة المكرمة', 'المدينة المنورة'],
    status: 'active',
    boqCount: 8,
    totalValue: 1250000000,
    lastUpdated: '2025-03-20',
    createdAt: '2024-11-10',
  },
  {
    id: '4',
    name: 'مجمع مستشفيات الرياض',
    cities: ['الرياض'],
    status: 'draft',
    boqCount: 0,
    totalValue: 0,
    lastUpdated: '2025-03-15',
    createdAt: '2025-03-10',
  },
  {
    id: '5',
    name: 'مشروع سكني - عسير',
    cities: ['عسير'],
    status: 'archived',
    boqCount: 2,
    totalValue: 340000000,
    lastUpdated: '2025-01-05',
    createdAt: '2024-06-20',
  },
];

export const sampleBoQItems: BoQItem[] = [
  {
    id: '1', itemNo: '1.1',
    description: 'أعمال حفر عام في التربة العادية بعمق لا يزيد عن 3 متر',
    descriptionEn: 'General excavation in normal soil up to 3m depth',
    unit: 'م³', quantity: 15000,
    unitRate: 28.50, totalPrice: 427500, materials: 2.00, labor: 12.50, equipment: 8.00, logistics: 3.00, risk: 1.50, profit: 1.50,
    confidence: 94, status: 'approved', source: 'library', locationFactor: 1.0, notes: 'Standard rate from library'
  },
  {
    id: '2', itemNo: '1.2',
    description: 'أعمال حفر في الصخر بجميع أنواعه',
    descriptionEn: 'Rock excavation of all types',
    unit: 'م³', quantity: 3500,
    unitRate: 95.00, totalPrice: 332500, materials: 5.00, labor: 25.00, equipment: 45.00, logistics: 8.00, risk: 7.00, profit: 5.00,
    confidence: 87, status: 'approved', source: 'library', locationFactor: 1.0,
  },
  {
    id: '3', itemNo: '1.3',
    description: 'ردم بمواد مختارة مع الدمك على طبقات',
    descriptionEn: 'Backfill with selected materials, compacted in layers',
    unit: 'م³', quantity: 8000,
    unitRate: 45.00, totalPrice: 360000, materials: 18.00, labor: 10.00, equipment: 9.00, logistics: 4.00, risk: 2.00, profit: 2.00,
    confidence: 91, status: 'approved', source: 'library', locationFactor: 1.0,
  },
  {
    id: '4', itemNo: '2.1',
    description: 'خرسانة عادية للأساسات بقوة 200 كجم/سم²',
    descriptionEn: 'Plain concrete for foundations, 200 kg/cm² strength',
    unit: 'م³', quantity: 2200,
    unitRate: 380.00, totalPrice: 836000, materials: 220.00, labor: 65.00, equipment: 40.00, logistics: 25.00, risk: 15.00, profit: 15.00,
    confidence: 92, status: 'approved', source: 'library', locationFactor: 1.0,
  },
  {
    id: '5', itemNo: '2.2',
    description: 'خرسانة مسلحة للأعمدة بقوة 400 كجم/سم²',
    descriptionEn: 'Reinforced concrete for columns, 400 kg/cm² strength',
    unit: 'م³', quantity: 1800,
    unitRate: 650.00, totalPrice: 1170000, materials: 380.00, labor: 110.00, equipment: 65.00, logistics: 40.00, risk: 30.00, profit: 25.00,
    confidence: 89, status: 'approved', source: 'ai', locationFactor: 1.0,
  },
  {
    id: '6', itemNo: '2.3',
    description: 'حديد تسليح بجميع الأقطار',
    descriptionEn: 'Reinforcement steel, all diameters',
    unit: 'طن', quantity: 950,
    unitRate: 4200.00, totalPrice: 3990000, materials: 3200.00, labor: 450.00, equipment: 200.00, logistics: 150.00, risk: 100.00, profit: 100.00,
    confidence: 85, status: 'review', source: 'ai', locationFactor: 1.0,
    notes: 'Price volatility in steel market - review recommended'
  },
  {
    id: '7', itemNo: '3.1',
    description: 'أعمال بلوك خرساني مقاس 20×20×40 سم',
    descriptionEn: 'Concrete block work 20×20×40 cm',
    unit: 'م²', quantity: 12000,
    unitRate: 85.00, totalPrice: 1020000, materials: 42.00, labor: 25.00, equipment: 5.00, logistics: 6.00, risk: 3.50, profit: 3.50,
    confidence: 93, status: 'approved', source: 'library', locationFactor: 1.0,
  },
  {
    id: '8', itemNo: '3.2',
    description: 'لياسة اسمنتية للجدران الداخلية',
    descriptionEn: 'Cement plaster for internal walls',
    unit: 'م²', quantity: 24000,
    unitRate: 35.00, totalPrice: 840000, materials: 12.00, labor: 16.00, equipment: 2.00, logistics: 2.00, risk: 1.50, profit: 1.50,
    confidence: 96, status: 'approved', source: 'library', locationFactor: 1.0,
  },
  {
    id: '9', itemNo: '4.1',
    description: 'أعمال عزل مائي للأسقف بمادة البيتومين',
    descriptionEn: 'Waterproofing for roofs using bitumen material',
    unit: 'م²', quantity: 5500,
    unitRate: 65.00, totalPrice: 357500, materials: 35.00, labor: 15.00, equipment: 5.00, logistics: 4.00, risk: 3.00, profit: 3.00,
    confidence: 72, status: 'review', source: 'ai', locationFactor: 1.0,
    notes: 'New item - limited pricing data available'
  },
  {
    id: '10', itemNo: '5.1',
    description: 'تركيب أنابيب PVC قطر 110 مم للصرف الصحي',
    descriptionEn: 'PVC pipe installation 110mm diameter for sewage',
    unit: 'م.ط', quantity: 3200,
    unitRate: 55.00, totalPrice: 176000, materials: 28.00, labor: 15.00, equipment: 4.00, logistics: 4.00, risk: 2.00, profit: 2.00,
    confidence: 45, status: 'conflict', source: 'ai', locationFactor: 1.05,
    notes: 'Conflicting rates found - manual review required'
  },
];

export const sampleRateLibrary: RateLibraryItem[] = [
  { id: '1', code: 'EXC-001', descriptionEn: 'General excavation, normal soil, depth ≤ 3m', descriptionAr: 'حفر عام في التربة العادية', unit: 'm³', baseRate: 28.50, materials: 2.00, labor: 12.50, equipment: 8.00, category: 'Earthworks', lastUsed: '2025-03-28', usageCount: 45 },
  { id: '2', code: 'EXC-002', descriptionEn: 'Rock excavation, all types', descriptionAr: 'حفر في الصخر', unit: 'm³', baseRate: 95.00, materials: 5.00, labor: 25.00, equipment: 45.00, category: 'Earthworks', lastUsed: '2025-03-25', usageCount: 23 },
  { id: '3', code: 'CON-001', descriptionEn: 'Plain concrete 200 kg/cm²', descriptionAr: 'خرسانة عادية 200 كجم', unit: 'm³', baseRate: 380.00, materials: 220.00, labor: 65.00, equipment: 40.00, category: 'Concrete', lastUsed: '2025-03-28', usageCount: 67 },
  { id: '4', code: 'CON-002', descriptionEn: 'Reinforced concrete 400 kg/cm²', descriptionAr: 'خرسانة مسلحة 400 كجم', unit: 'm³', baseRate: 650.00, materials: 380.00, labor: 110.00, equipment: 65.00, category: 'Concrete', lastUsed: '2025-03-20', usageCount: 52 },
  { id: '5', code: 'STL-001', descriptionEn: 'Reinforcement steel, all diameters', descriptionAr: 'حديد تسليح', unit: 'ton', baseRate: 4200.00, materials: 3200.00, labor: 450.00, equipment: 200.00, category: 'Steel', lastUsed: '2025-03-28', usageCount: 38 },
  { id: '6', code: 'MSN-001', descriptionEn: 'Concrete block 20×20×40 cm', descriptionAr: 'بلوك خرساني', unit: 'm²', baseRate: 85.00, materials: 42.00, labor: 25.00, equipment: 5.00, category: 'Masonry', lastUsed: '2025-03-15', usageCount: 41 },
  { id: '7', code: 'PLT-001', descriptionEn: 'Cement plaster, internal walls', descriptionAr: 'لياسة اسمنتية', unit: 'm²', baseRate: 35.00, materials: 12.00, labor: 16.00, equipment: 2.00, category: 'Finishes', lastUsed: '2025-03-10', usageCount: 55 },
  { id: '8', code: 'WPR-001', descriptionEn: 'Waterproofing, bitumen, roofs', descriptionAr: 'عزل مائي بيتومين', unit: 'm²', baseRate: 65.00, materials: 35.00, labor: 15.00, equipment: 5.00, category: 'Waterproofing', lastUsed: '2025-02-28', usageCount: 12 },
];

export const sampleDocuments: ProjectDocument[] = [
  { id: '1', name: 'كراسة الشروط والمواصفات', type: 'core', fileType: 'PDF', size: '12.5 MB', uploadedAt: '2025-01-20' },
  { id: '2', name: 'نطاق العمل التفصيلي', type: 'core', fileType: 'PDF', size: '8.3 MB', uploadedAt: '2025-01-20' },
  { id: '3', name: 'المخططات المعمارية', type: 'technical', fileType: 'DWG', size: '45.2 MB', uploadedAt: '2025-01-22' },
  { id: '4', name: 'المواصفات الكهربائية', type: 'technical', fileType: 'PDF', size: '5.7 MB', uploadedAt: '2025-01-25' },
  { id: '5', name: 'تقرير فحص التربة', type: 'technical', fileType: 'PDF', size: '3.1 MB', uploadedAt: '2025-02-01' },
  { id: '6', name: 'خطاب الدعوة', type: 'other', fileType: 'PDF', size: '0.8 MB', uploadedAt: '2025-01-15' },
];

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-SA', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 }).format(value);
};

export const formatNumber = (value: number, decimals = 2): string => {
  return new Intl.NumberFormat('en-SA', { maximumFractionDigits: decimals }).format(value);
};
