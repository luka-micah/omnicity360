// Development seed data
// All data is fictional. Never run against production.
import { PrismaClient } from '@prisma/client';

import '../src/config/load-env.js';
import { hashPassword } from '../src/lib/password.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Seeding development data...');

  // Create platform admin
  const adminPassword = await hashPassword('Admin123!Change');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.test' },
    update: {},
    create: {
      email: 'admin@example.test',
      passwordHash: adminPassword,
      firstName: 'Platform',
      lastName: 'Admin',
      role: 'platform_admin',
      emailVerified: true,
    },
  });

  // Create customer
  const customerPassword = await hashPassword('Customer123!Change');
  const customer = await prisma.user.upsert({
    where: { email: 'customer@example.test' },
    update: {},
    create: {
      email: 'customer@example.test',
      passwordHash: customerPassword,
      firstName: 'Ada',
      lastName: 'Okafor',
      phone: '+2348012345678',
      role: 'customer',
      emailVerified: true,
      customerProfile: {
        create: { city: 'Lagos', state: 'Lagos', country: 'NG' },
      },
    },
  });

  // Create hotel partner
  const partnerPassword = await hashPassword('Partner123!Change');
  const partner = await prisma.user.upsert({
    where: { email: 'partner@example.test' },
    update: {},
    create: {
      email: 'partner@example.test',
      passwordHash: partnerPassword,
      firstName: 'Chidi',
      lastName: 'Balogun',
      phone: '+2348098765432',
      role: 'hotel_owner',
      emailVerified: true,
    },
  });

  await prisma.partnerProfile.upsert({
    where: { userId: partner.id },
    update: {},
    create: {
      userId: partner.id,
      companyName: 'Balogun Hospitality Group',
      companyRegistrationNumber: 'RC-1234567',
    },
  });

  // Create sample hotels
  const hotels = [
    {
      name: 'Lekki Palm Hotel',
      slug: 'lekki-palm-hotel',
      description:
        'A contemporary hotel in the heart of Lekki, offering comfortable rooms and easy access to Lagos business districts.',
      propertyType: 'hotel',
      addressLine1: '12 Admiralty Way',
      city: 'Lekki',
      state: 'Lagos',
      contactEmail: 'stay@lekkipalm.example.test',
      contactPhone: '+2348011112222',
      amenities: ['wifi', 'parking', 'restaurant', 'air_conditioning', 'security'],
      status: 'approved' as const,
      submittedAt: new Date(),
      approvedAt: new Date(),
      approvedBy: admin.id,
      defaultCommissionBps: 1000,
      images: [
        {
          url: 'https://images.example.test/lekki-palm/lobby.jpg',
          caption: 'Reception lobby',
          altText: 'Hotel reception lobby with seating',
          sortOrder: 0,
        },
        {
          url: 'https://images.example.test/lekki-palm/exterior.jpg',
          caption: 'Street view',
          altText: 'Hotel exterior on Admiralty Way',
          sortOrder: 1,
        },
      ],
    },
    {
      name: 'Wuse Central Suites',
      slug: 'wuse-central-suites',
      description:
        'Serviced suites in Wuse 2, Abuja, ideal for business travellers and longer stays.',
      propertyType: 'apartment',
      addressLine1: '45 Aminu Kano Crescent',
      city: 'Abuja',
      state: 'FCT',
      contactEmail: 'hello@wusecentral.example.test',
      contactPhone: '+2348022223333',
      amenities: ['wifi', 'parking', 'kitchenette', 'gym', 'security'],
      status: 'approved' as const,
      submittedAt: new Date(),
      approvedAt: new Date(),
      approvedBy: admin.id,
      defaultCommissionBps: 1000,
      images: [
        {
          url: 'https://images.example.test/wuse-central/living-room.jpg',
          caption: 'Living area',
          altText: 'Serviced suite living area',
          sortOrder: 0,
        },
      ],
    },
  ];

  for (const hotelData of hotels) {
    const { images, ...hotelFields } = hotelData;
    const hotel = await prisma.hotel.upsert({
      where: { slug: hotelData.slug },
      update: {},
      create: {
        ...hotelFields,
        partnerId: partner.id,
        checkInTime: '14:00',
        checkOutTime: '11:00',
        memberships: {
          create: { userId: partner.id, role: 'owner', status: 'active', acceptedAt: new Date() },
        },
      },
    });

    // Onboarding metadata (idempotent): image metadata, a verified document, and
    // the lifecycle history an approved hotel would accumulate in Phase 3.
    if ((await prisma.hotelMedia.count({ where: { hotelId: hotel.id } })) === 0) {
      await prisma.hotelMedia.createMany({
        data: images.map((image, index) => ({
          hotelId: hotel.id,
          url: image.url,
          caption: image.caption ?? null,
          altText: image.altText ?? null,
          sortOrder: image.sortOrder ?? index,
          mimeType: 'image/jpeg',
        })),
      });
    }

    if ((await prisma.hotelDocument.count({ where: { hotelId: hotel.id } })) === 0) {
      await prisma.hotelDocument.create({
        data: {
          hotelId: hotel.id,
          type: 'cac_certificate',
          url: `https://documents.example.test/${hotel.slug}/cac-certificate.pdf`,
          description: 'Certificate of incorporation',
          verified: true,
          verifiedBy: admin.id,
          verifiedAt: new Date(),
        },
      });
    }

    if ((await prisma.hotelStatusHistory.count({ where: { hotelId: hotel.id } })) === 0) {
      await prisma.hotelStatusHistory.createMany({
        data: [
          {
            hotelId: hotel.id,
            fromStatus: null,
            toStatus: 'draft',
            actorId: partner.id,
            actorType: 'user',
            notes: 'Hotel created',
          },
          {
            hotelId: hotel.id,
            fromStatus: 'draft',
            toStatus: 'submitted',
            actorId: partner.id,
            actorType: 'user',
          },
          {
            hotelId: hotel.id,
            fromStatus: 'submitted',
            toStatus: 'under_review',
            actorId: admin.id,
            actorType: 'user',
          },
          {
            hotelId: hotel.id,
            fromStatus: 'under_review',
            toStatus: 'approved',
            actorId: admin.id,
            actorType: 'user',
            reason: 'Registration documents verified',
          },
        ],
      });
    }

    // Create room categories
    const roomCategories = [
      {
        name: 'Standard Room',
        slug: 'standard-room',
        description: 'Comfortable room with queen bed, air conditioning, and free Wi-Fi.',
        maxAdults: 2,
        maxChildren: 1,
        bedConfiguration: '1 Queen Bed',
        roomSizeSqm: 24,
        amenities: ['wifi', 'air_conditioning', 'tv', 'private_bathroom'],
        baseRateAmount: 4500000, // NGN 45,000.00
        totalQuantity: 10,
      },
      {
        name: 'Deluxe Room',
        slug: 'deluxe-room',
        description: 'Spacious room with king bed, workspace, and city view.',
        maxAdults: 2,
        maxChildren: 1,
        bedConfiguration: '1 King Bed',
        roomSizeSqm: 32,
        amenities: ['wifi', 'air_conditioning', 'tv', 'private_bathroom', 'workspace'],
        baseRateAmount: 6500000, // NGN 65,000.00
        totalQuantity: 6,
      },
    ];

    for (const roomData of roomCategories) {
      const roomCategory = await prisma.roomCategory.upsert({
        where: { hotelId_slug: { hotelId: hotel.id, slug: roomData.slug } },
        update: {},
        create: {
          ...roomData,
          hotelId: hotel.id,
          inventoryMode: 'category_quantity',
          baseRateCurrency: 'NGN',
        },
      });

      // Create default rate plan
      const existingRatePlan = await prisma.ratePlan.findFirst({
        where: { roomCategoryId: roomCategory.id, name: 'Standard Rate' },
      });
      if (!existingRatePlan) {
        await prisma.ratePlan.create({
          data: {
            hotelId: hotel.id,
            roomCategoryId: roomCategory.id,
            name: 'Standard Rate',
            type: 'standard',
            baseRateAmount: roomData.baseRateAmount,
            baseRateCurrency: 'NGN',
            minStayNights: 1,
          },
        });
      }

      // Seed inventory for the next 90 days in one batch (idempotent).
      const inventory: Array<{
        hotelId: string;
        roomCategoryId: string;
        date: Date;
        quantity: number;
      }> = [];
      const today = new Date();
      for (let i = 0; i < 90; i++) {
        const date = new Date(
          Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + i)
        );
        inventory.push({
          hotelId: hotel.id,
          roomCategoryId: roomCategory.id,
          date,
          quantity: roomData.totalQuantity,
        });
      }
      await prisma.inventoryDay.createMany({ data: inventory, skipDuplicates: true });
    }
  }

  // Platform default cancellation policies
  const policies = [
    {
      name: 'Flexible',
      template: 'flexible' as const,
      description: 'Free cancellation up to 24 hours before check-in. No refund after that.',
      freeCancellationUntilHoursBeforeCheckIn: 24,
    },
    {
      name: 'Moderate',
      template: 'moderate' as const,
      description: 'Free cancellation up to 5 days before check-in. 50% refund after that.',
      freeCancellationUntilHoursBeforeCheckIn: 120,
      refundPercentAfterDays: 50,
    },
    {
      name: 'Strict',
      template: 'strict' as const,
      description: '50% refund up to 7 days before check-in. No refund after that.',
      refundPercentBeforeDays: 50,
      refundPercentAfterDays: 0,
    },
    {
      name: 'Non-refundable',
      template: 'non_refundable' as const,
      description: 'No refunds. This rate cannot be cancelled or modified.',
      refundPercentBeforeDays: 0,
      refundPercentAfterDays: 0,
    },
  ];

  for (const policy of policies) {
    const existing = await prisma.cancellationPolicy.findFirst({
      where: { name: policy.name, isPlatformTemplate: true },
    });
    if (!existing) {
      await prisma.cancellationPolicy.create({
        data: { ...policy, isPlatformTemplate: true },
      });
    }
  }

  console.log('Seed complete.');
  console.log('Development accounts (password shown only in dev):');
  console.log('  admin@example.test / Admin123!Change');
  console.log('  customer@example.test / Customer123!Change');
  console.log('  partner@example.test / Partner123!Change');
  console.log({ adminId: admin.id, customerId: customer.id, partnerId: partner.id });
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
