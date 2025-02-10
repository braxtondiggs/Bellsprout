export interface Brewery {
  name: string;
  address: string;
  phone?: string;
  website?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}
