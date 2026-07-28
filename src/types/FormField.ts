export interface FormField {
  defaultValues?: string[];
  options?: {
    name?: string;
    value?: string;
  }[];
  allowedValues?: string[];
  defaultReferences?: string[];
  allowedReferences?: string[];
  developerOnly?: any[];
  minimum?: number;
  askCount?: number;
  maximum?: number;
  title?: string;
  type?: string;
  directive?: string;
  key?: string;
  fields?: FormField[];
  params?: {
    restrictType?: string | null;
    ticketing?: {
      enabled?: boolean;
      events?: string[];
    };
    campuses?: string[];
    targetRealms?: string[];
    targetCapabilities?: string[];
    targetTeams?: string[];
    targetProcesses?: string[];
    targetTags?: string[];
    targetTagsRemove?: string[];
    targetReactions?: string[];
    targetEvents?: string[];
    disableWebform?: boolean;
  };
  description?: string;
  asObject?: boolean;
  sameLine?: boolean;
  className?: string;
  expressions?: {
    show?: string;
    hide?: string;
    required?: string;
  };
  placeholder?: string;
}
