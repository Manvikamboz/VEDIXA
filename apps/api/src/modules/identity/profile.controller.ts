import { FastifyInstance } from 'fastify';
import { db } from '../../core/db/client.js';
import { studentProfiles, users } from '../../core/db/schema.js';
import { eq } from 'drizzle-orm';
import { authenticate } from './auth.middleware.js';
import { OnboardingSchema, UpdateProfileSchema } from '@vedixa/schemas';
import { NotFoundError } from '../../core/errors.js';

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // Get current user profile
  app.get('/me', async (request, reply) => {
    const userId = request.user!.sub;

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new NotFoundError('User not found');

    const [profile] = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, userId)).limit(1);

    return reply.send({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        role: user.role,
        isMinor: user.isMinor,
        parentConsentGranted: Boolean(user.parentConsentGrantedAt),
        profile: profile || null,
      },
    });
  });

  // Onboarding Wizard Submission
  app.post('/onboarding', async (request, reply) => {
    const userId = request.user!.sub;
    const body = OnboardingSchema.parse(request.body);

    const [existing] = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, userId)).limit(1);

    let savedProfile;
    if (existing) {
      [savedProfile] = await db
        .update(studentProfiles)
        .set({
          targetExam: body.targetExam,
          targetYear: body.targetYear,
          classGrade: body.classGrade,
          languagePreference: body.languagePreference,
          dailyBudgetMinutes: body.dailyBudgetMinutes,
          onboardingCompletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(studentProfiles.userId, userId))
        .returning();
    } else {
      [savedProfile] = await db
        .insert(studentProfiles)
        .values({
          userId,
          targetExam: body.targetExam,
          targetYear: body.targetYear,
          classGrade: body.classGrade,
          languagePreference: body.languagePreference,
          dailyBudgetMinutes: body.dailyBudgetMinutes,
          onboardingCompletedAt: new Date(),
        })
        .returning();
    }

    return reply.status(200).send({
      success: true,
      data: savedProfile,
    });
  });

  // Update Profile
  app.patch('/me', async (request, reply) => {
    const userId = request.user!.sub;
    const body = UpdateProfileSchema.parse(request.body);

    const [updated] = await db
      .update(studentProfiles)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(studentProfiles.userId, userId))
      .returning();

    return reply.send({
      success: true,
      data: updated,
    });
  });
}
