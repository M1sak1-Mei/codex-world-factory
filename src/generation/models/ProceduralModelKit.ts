export type ProceduralModelCategory =
  | 'structure'
  | 'prop'
  | 'effect'
  | 'ground-cover';

/** Discoverable metadata for reusable, code-generated model primitives. */
export interface ProceduralModelDescriptor {
  id: string;
  label: string;
  category: ProceduralModelCategory;
  instanced: boolean;
}

/** Base contract shared by model kits; scene generators depend on typed extensions. */
export interface ProceduralModelKit {
  id: string;
  models: readonly ProceduralModelDescriptor[];
}
