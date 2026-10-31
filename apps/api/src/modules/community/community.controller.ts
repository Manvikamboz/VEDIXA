import { FastifyInstance } from 'fastify';
import { db } from '../../core/db/client.js';
import {
  communityPosts,
  communityComments,
  contentReports,
  xpLedger,
  userBadges,
  users,
} from '../../core/db/schema.js';
import { eq, desc, and } from 'drizzle-orm';
import { authenticate } from '../identity/auth.middleware.js';
import { CreatePostSchema, CreateCommentSchema, ReportContentSchema } from '@vedixa/schemas';

export async function communityRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // List community posts for target exam
  app.get('/posts', async (request, reply) => {
    const { exam } = request.query as { exam?: any };

    const posts = await db
      .select({
        id: communityPosts.id,
        title: communityPosts.title,
        contentMarkdown: communityPosts.contentMarkdown,
        upvoteCount: communityPosts.upvoteCount,
        commentCount: communityPosts.commentCount,
        createdAt: communityPosts.createdAt,
        authorName: users.name,
      })
      .from(communityPosts)
      .innerJoin(users, eq(communityPosts.authorId, users.id))
      .where(
        and(
          eq(communityPosts.moderationStatus, 'VISIBLE'),
          exam ? eq(communityPosts.exam, exam) : undefined
        )
      )
      .orderBy(desc(communityPosts.createdAt))
      .limit(25);

    return reply.send({ success: true, data: posts });
  });

  // Create community post
  app.post('/posts', async (request, reply) => {
    const authorId = request.user!.sub;
    const body = CreatePostSchema.parse(request.body);

    const [post] = await db
      .insert(communityPosts)
      .values({
        authorId,
        exam: body.examType,
        subject: body.subject,
        title: body.title,
        contentMarkdown: body.contentMarkdown,
        questionReferenceId: body.questionReferenceId,
      })
      .returning();

    return reply.status(201).send({ success: true, data: post });
  });

  // Report inappropriate content (DPDP / minor safety compliance)
  app.post('/reports', async (request, reply) => {
    const userId = request.user!.sub;
    const body = ReportContentSchema.parse(request.body);

    await db.insert(contentReports).values({
      reportedByUserId: userId,
      contentType: body.contentType,
      contentId: body.contentId,
      reason: body.reason,
      details: body.details,
    });

    return reply.status(200).send({
      success: true,
      data: { message: 'Report submitted. Our moderation team will review within 24 hours.' },
    });
  });

  // User Gamification Ledger & Badges
  app.get('/gamification/badges', async (request, reply) => {
    const userId = request.user!.sub;

    const badges = await db
      .select()
      .from(userBadges)
      .where(eq(userBadges.userId, userId));

    const ledger = await db
      .select()
      .from(xpLedger)
      .where(eq(xpLedger.userId, userId))
      .orderBy(desc(xpLedger.createdAt))
      .limit(20);

    return reply.send({
      success: true,
      data: {
        badges,
        recentXpHistory: ledger,
      },
    });
  });
}
