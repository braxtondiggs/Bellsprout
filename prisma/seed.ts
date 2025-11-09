import { PrismaClient, Region } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // NYC Breweries
  const nycBreweries = [
    {
      name: 'Other Half Brewing',
      slug: 'other-half-brewing',
      city: 'Brooklyn',
      state: 'NY',
      region: Region.NYC,
      description: 'Brooklyn-based craft brewery known for hazy IPAs',
      websiteUrl: 'https://otherhalfbrewing.com',
      instagramHandle: 'otherhalfnyc',
      emailDomain: 'otherhalfbrewing.com',
    },
    {
      name: 'Torch & Crown Brewing',
      slug: 'torch-crown-brewing',
      city: 'Manhattan',
      state: 'NY',
      region: Region.NYC,
      description: 'Manhattan craft brewery and taproom',
      websiteUrl: 'https://torchandcrownbrewing.com',
      instagramHandle: 'torchandcrown',
    },
    {
      name: 'Sixpoint Brewery',
      slug: 'sixpoint-brewery',
      city: 'Brooklyn',
      state: 'NY',
      region: Region.NYC,
      description: 'Brooklyn craft brewery with wide distribution',
      websiteUrl: 'https://sixpoint.com',
      instagramHandle: 'sixpoint',
      rssFeedUrl: 'https://sixpoint.com/feed/',
    },
    {
      name: 'Brooklyn Brewery',
      slug: 'brooklyn-brewery',
      city: 'Brooklyn',
      state: 'NY',
      region: Region.NYC,
      description: 'Iconic Brooklyn craft brewery',
      websiteUrl: 'https://brooklynbrewery.com',
      instagramHandle: 'brooklynbrewery',
      emailDomain: 'brooklynbrewery.com',
    },
    {
      name: 'Greenpoint Beer & Ale',
      slug: 'greenpoint-beer-ale',
      city: 'Brooklyn',
      state: 'NY',
      region: Region.NYC,
      description: 'Greenpoint neighborhood brewery',
      websiteUrl: 'https://greenpointbeer.com',
      instagramHandle: 'greenpointbeer',
    },
  ];

  // DC Breweries
  const dcBreweries = [
    {
      name: 'Right Proper Brewing',
      slug: 'right-proper-brewing',
      city: 'Washington',
      state: 'DC',
      region: Region.DC,
      description: 'DC craft brewery with two locations',
      websiteUrl: 'https://rightproperbrewing.com',
      instagramHandle: 'rightproperdc',
      emailDomain: 'rightproperbrewing.com',
    },
    {
      name: 'Bluejacket',
      slug: 'bluejacket',
      city: 'Washington',
      state: 'DC',
      region: Region.DC,
      description: 'Navy Yard brewery with restaurant',
      websiteUrl: 'https://bluejacketdc.com',
      instagramHandle: 'bluejacketdc',
    },
    {
      name: 'DC Brau',
      slug: 'dc-brau',
      city: 'Washington',
      state: 'DC',
      region: Region.DC,
      description: 'First packaged beer brewery in DC since Prohibition',
      websiteUrl: 'https://dcbrau.com',
      instagramHandle: 'dcbrau',
      emailDomain: 'dcbrau.com',
    },
    {
      name: 'Atlas Brew Works',
      slug: 'atlas-brew-works',
      city: 'Washington',
      state: 'DC',
      region: Region.DC,
      description: 'Ivy City craft brewery',
      websiteUrl: 'https://atlasbrewworks.com',
      instagramHandle: 'atlasbrewworks',
    },
    {
      name: 'Hellbender Brewing',
      slug: 'hellbender-brewing',
      city: 'Washington',
      state: 'DC',
      region: Region.DC,
      description: 'DC brewery focused on lagers and ales',
      websiteUrl: 'https://hellbenderbrewing.com',
      instagramHandle: 'hellbenderbrewing',
    },
  ];

  // Upsert all breweries
  for (const brewery of [...nycBreweries, ...dcBreweries]) {
    await prisma.brewery.upsert({
      where: { slug: brewery.slug },
      update: brewery,
      create: brewery,
    });
    console.log(`✓ Seeded brewery: ${brewery.name}`);
  }

  console.log(`\n✅ Successfully seeded ${nycBreweries.length + dcBreweries.length} breweries`);
  console.log(`   - NYC: ${nycBreweries.length} breweries`);
  console.log(`   - DC: ${dcBreweries.length} breweries`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
