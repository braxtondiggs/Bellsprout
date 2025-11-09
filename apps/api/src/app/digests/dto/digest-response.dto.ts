export interface DigestResponseDto {
  id: string;
  userId: string;
  deliveryStatus: 'pending' | 'sent' | 'failed';
  deliveryDate: Date;
  sentAt: Date | null;
  contentItemsCount: number;
  breweriesCount: number;
  generatedAt: Date;
  createdAt: Date;
}

export interface DigestFilterDto {
  userId?: string;
  deliveryStatus?: 'pending' | 'sent' | 'failed';
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}
