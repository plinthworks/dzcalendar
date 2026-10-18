import type { ResourceId } from '../event/types.js';
import type { BusinessHoursInput } from '../rules/business-hours.js';
import type { ConstraintSpec } from '../rules/validate.js';
import type { ZoneId } from '../temporal.js';

/**
 * A resource as an application gives it: a person, a room, a machine —
 * whatever events are booked on. Fields beyond these are kept (`input`) for
 * grouping, ordering and the timeline's columns.
 */
export interface ResourceInput {
  readonly id: ResourceId;
  readonly title?: string;
  /** Its parent in the tree (a department above its doctors). */
  readonly parentId?: ResourceId;
  /** Siblings are drawn by this number first (lowest first), then as given. */
  readonly order?: number;
  /** Where its business hours are read (a doctor in Riyadh): the calendar's zone when absent. */
  readonly timeZone?: ZoneId;
  /** Its own hours, over the calendar's. */
  readonly businessHours?: BusinessHoursInput;
  /** Where its events may go, over the calendar's `constraint`. */
  readonly eventConstraint?: ConstraintSpec;
  /** False: no two events on it overlap, whatever the calendar's `overlap`. */
  readonly eventOverlap?: boolean;
  readonly classNames?: readonly string[];
  readonly extendedProps?: Readonly<Record<string, unknown>>;
  readonly [field: string]: unknown;
}

/** A resource as the calendar keeps it: checked, frozen, with what was given beside it. */
export interface Resource {
  readonly id: ResourceId;
  readonly title: string;
  /** Null for a root, and for one whose parent is unknown or in a cycle (reported). */
  readonly parentId: ResourceId | null;
  readonly order: number | null;
  readonly timeZone: ZoneId | null;
  readonly businessHours: BusinessHoursInput | null;
  readonly eventConstraint: ConstraintSpec | null;
  readonly eventOverlap: boolean | null;
  readonly classNames: readonly string[];
  readonly extendedProps: Readonly<Record<string, unknown>>;
  /** What the application gave: its own fields are read from here (`fieldOf`). */
  readonly input: ResourceInput;
}

export interface ResourceNode {
  readonly resource: Resource;
  /** 0 for a root. */
  readonly depth: number;
  /** Ids from the root down to this one, itself included. */
  readonly path: readonly ResourceId[];
  readonly parent: ResourceNode | null;
  readonly children: readonly ResourceNode[];
}

export interface ResourceTree {
  readonly roots: readonly ResourceNode[];
  readonly byId: ReadonlyMap<ResourceId, ResourceNode>;
  /** Every resource, depth first, siblings in order: the columns' order, a timeline's rows all expanded. */
  readonly order: readonly Resource[];
}

/** How siblings are ordered: field names (`'-'` first: descending), or a comparison. */
export type ResourceOrder = string | readonly string[] | ((a: Resource, b: Resource) => number);
