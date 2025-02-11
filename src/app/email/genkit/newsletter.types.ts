export interface NewsletterResponse {
  breweryName: string;
  events?: Array<{
    date: string; // Changed from Date to string
    eventName: string;
    location?: string;
    description: string;
    liveMusic?: boolean;
    foodTrucks?: string[];
    happyHours?: string;
  }>;
  newReleases?: {
    beerName: string;
    description: string;
    abv?: number;
    style?: string;
  }[];
  tastingNotes?: {
    beerName: string;
    notes: string;
  }[];
  contactInfo?: {
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
  };
  hoursOfOperation?: {
    regularHours?: Record<string, string>;
    holidayHours?: {
      date: Date;
      hours: string;
    }[];
  };
  breweryNews?: string[];
}
