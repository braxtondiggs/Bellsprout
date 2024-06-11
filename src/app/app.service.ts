import { Injectable, Inject } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { generate } from '@genkit-ai/ai';
import { defineFlow, runFlow } from '@genkit-ai/flow';
import { openAI, gpt4o } from 'genkitx-openai';
import * as z from 'zod';

import { EmailDto } from './dto/email.dto';

@Injectable()
export class AppService {
  private db: Firestore;
  private readonly getDataFlow: (subject: string) => Promise<any>;
  private text = `This Week At The Bronx Brewery! Brewery by Kill the Newsletter! / May 20, 2024 at 12:00 PM//keep unread//hide It's another week of exceptional hoppenings! Come join us for a cheers, why don't ya?! STAY UP-TO-DATE HERE THIS WEEK AT THE BRONX BREWERY! BX Trivia Night - Tuesday [May 21st] at 7:00pm (Bronx Taproom) Calling all trivia enthusiasts and beer aficionados! Get ready for an epic showdown of intellect and ingenuity at our BX Trivia Night, hosted by the incomparable Demi De Jesus. Join us at our beloved Bronx Taproom for an evening of mind-bending questions, spirited competition, and endless fun. Whether you're a seasoned trivia master or a novice seeking thrills, our event offers the perfect opportunity to showcase your smarts, enjoy delicious brews, and connect with fellow trivia lovers. So gather your brainiest buddies, sharpen your pencils, and let the games begin! Free! EV Trivia Night - Tuesday [May 21st] at 7:00pm (East Village) Join us for an exhilarating evening of brain-busting challenges and friendly competition at our renowned Trivia Night in the heart of the East Village. Hosted by the charismatic Manny Zahonet, our trivia extravaganza promises an unforgettable experience of wit, wisdom, and wonder. Grab your favorite brew, gather your cleverest comrades, and prepare to test your knowledge across a dazzling array of categories. With exciting prizes, drink specials, and the thrill of victory at stake, it's an event you won't want to miss! Free! Dungeons & Drafts - Wednesday [May 22nd] at 7:00pm (East Village) Embark on an epic adventure at our Dungeons & Dragons event! Join fellow fantasy enthusiasts at our East Village taproom and delve into thrilling quests while enjoying our diverse selection of brews. Whether you're a seasoned player or new to the game, you're in for an unforgettable night of camaraderie and fantasy! Free! Survivor Drinking Watch Party - Wednesday [May 22nd] at 8:00pm (East Village) Join us for an exhilarating evening of island adventure and intrigue at our thrilling Survivor Watch Party. Immerse yourself in the drama and suspense of the hit reality TV show as you sip on refreshing drinks and engage in lively discussions with fellow fans. From daring challenges to shocking tribal councils, experience every twist and turn of the Survivor journey while enjoying the convivial atmosphere of our watch party extravaganza! Free! Alpha Minds Productions Concert Showcase - Friday [May 24th] at 6:00pm (The Backyard) Kick off your weekend with an electrifying concert showcase brought to you by Alpha Minds Productions. Experience a dynamic lineup of hip hop artists, each bringing their unique sound to our Bronx backyard. Whether you're winding down or gearing up, this event promises an evening of incredible music and vibes! Free! Ma9icKingdom Vol.1 - Friday [May 24th] at 7:00pm (East Village) Step into a world of wonder with Ma9icKingdom Vol.1, brought to you by The People's People. Enjoy live performances from local talent, mesmerizing magic shows, and sets from DJs Pebble Stone, AKA, and Lara Gerin. It's an event packed with art, music, and magic, creating an unforgettable experience! Free! Beer & Fun by The Landlords & Friendly Neighborhood DJs - Saturday [May 25th] at 4:00pm (The Backyard) Join us for an epic Saturday afternoon music party featuring the best DJs in the neighborhood. Fresh off their VGA x BXB festival success, Friendly Neighborhood DJs and The Landlords are ready to throw down in our backyard. Enjoy an open format of music, great vibes, and of course, fantastic brews! Ticketed! Collab Night: Art by Jar - Saturday [May 25th] at 7:00pm (East Village) Spend an evening with the talented tattoo artist Jar as we gear up for the launch of her collaboration brew with The Bronx Brewery. Enjoy custom flash tattoos and get a sneak peek into the creative process behind the upcoming Y-Series release. It's a night of art, beer, and anticipation you won't want to miss! Free! Books & Brews - Sunday [May 26th] at 1:00pm (Bronx Taproom) Join our official book club, Books & Brews, at the Bronx taproom. This week, we'll be concluding "Strange Weather in Tokyo" by Hiromi Kawakami. Come ready to discuss the final pages (96 to the end) and share your thoughts while enjoying our exceptional selection of brews. It's the perfect way to combine your love of reading and craft beer! Free! Join us for an exceptional week filled with diverse experiences that celebrate community, creativity, and inclusivity. Your presence makes our events come to life, and we can't wait to share these extraordinary moments with you! Cheers! Please note that event details and schedules are subject to change. Stay tuned for any updates or additional announcements. WORLD BEE(R) DAY 2024 @ THE BRONX BREWERY Buzz on over to our taproom and join us in celebrating World Bee Day on May 20th! We're sweetening the deal with $1 off our Bad Business Honey Blonde Ale. This golden brew, infused with the rich flavors of local honey, is the perfect way to toast to our favorite pollinators. Don't miss out on this un-bee-lievable offer! Come raise a glass to the bees that keep our world blooming and our beers delicious. It's the bee's knees of beer specials – only for a limited time. So, hive yourself a treat and get in on the buzz at our taproom! 🐝🍻 MEMORIAL DAY WEEKEND SPECIALS Get ready to kick off your Memorial Day Weekend with unbeatable deals at The Bronx Brewery! We're celebrating with a lineup of specials that you won't want to miss, happening at all three of our taproom locations. Saturday & Sunday: BOGO Special Buy One, Get One on all beers to-go! Whether you're grabbing a single can, a 4-pack, or a whole case, you'll score an extra one for free. It's the perfect time to stock up for your weekend festivities. Monday, 5/27: $5 Draft Pours Wrap up the holiday weekend with $5 draft pours on all your favorite beers. Come and enjoy the best brews at the best prices as we salute the long weekend. Join us for a weekend filled with great beer, good vibes, and fantastic deals. Cheers to a memorable Memorial Day Weekend at The Bronx Brewery! If you have served or have a family member that served, we thank you the your/their service to our country! Add A Review! REVIEW US ON GOOGLE Share Tweet Forward Copyright © 2024 The Bronx Brewery, All rights reserved. You were subscribed to the newsletter from The Bronx Brewery Our mailing address is: The Bronx Brewery 856 East 136th Street Bronx, NY 10454`;
  private newsletterFlow = defineFlow(
    {
      name: 'newsletterFlow',
      inputSchema: z.string(),
      outputSchema: z.object({
        breweryName: z.string().optional(),
        events: z
          .array(
            z.object({
              date: z.string(),
              eventName: z.string(),
              description: z.string(),
            })
          )
          .optional(),
        newReleases: z
          .array(
            z.object({
              beerName: z.string(),
              description: z.string(),
            })
          )
          .optional(),
        tastingNotes: z
          .array(
            z.object({
              beerName: z.string(),
              notes: z.string(),
            })
          )
          .optional(),
        contactInfo: z
          .object({
            address: z.string().optional(),
            phone: z.string().optional(),
            email: z.string().optional(),
          })
          .optional(),
      }),
    },
    async (subject: any): Promise<any> => {
      const prompt = `Extract the brewery name, event details, new beer releases, tasting notes, and contact information from the following newsletter content: ${subject}`;

      const llmResponse = await generate({
        model: gpt4o,
        prompt: prompt,
      });

      const response = llmResponse.text();
      return response;
    }
  ) as any;

  constructor(@Inject('FIREBASE_ADMIN') private readonly firebaseAdmin) {
    this.db = this.firebaseAdmin.firestore();
  }

  async getNewsLetter(email: EmailDto): Promise<any> {
    // return await runFlow(this.newsletterFlow, this.text);
  }

  async getData() {
    const userDoc = await this.db
      .collection('breweries')
      .doc('ChIJ-1YKW9wZBYgRhzxQFkxQGRY')
      .get();
    return userDoc.data();
  }

  extractBreweryName(response: any): any {
    return [];
  }

  // Example implementations of other extraction functions
  extractEvents(response: any): any {
    // Implement your logic here
    return [];
  }

  extractNewReleases(response: any): any {
    // Implement your logic here
    return [];
  }

  extractTastingNotes(response: any): any {
    // Implement your logic here
    return [];
  }

  extractContactInfo(response: any): any {
    // Implement your logic here
    return {
      address: '',
      phone: '',
      email: '',
    };
  }
}
