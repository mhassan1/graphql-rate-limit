import test from 'ava';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { graphql } from 'graphql';
import { applyMiddleware } from 'graphql-middleware';
import { shield } from 'graphql-shield';
import { createRateLimitRule } from './rate-limit-shield-rule';
import { getGraphQLRateLimiter } from './get-graphql-rate-limiter';

test('batch query should error when rate limit exceeded', async (t) => {
  const rule = createRateLimitRule({
    identifyContext: (ctx) => ctx.id,
    enableBatchRequestCache: true,
  });
  const schema = applyMiddleware(
    makeExecutableSchema({
      resolvers: { Query: { test: () => 'Result' } },
      typeDefs: 'type Query { test: String! }',
    }),
    shield(
      { Query: { test: rule({ max: 1, window: '1s' }) } },
      { allowExternalErrors: true }
    )
  );
  const { data } = await graphql({
    schema,
    source: 'query { test otherTest: test otherOtherTest: test }',
    rootValue: {},
    contextValue: { id: '1' },
  });
  t.is(data, null);
});

test('batch query should succeed when within rate limit', async (t) => {
  const rule = createRateLimitRule({
    identifyContext: (ctx) => ctx.id,
    enableBatchRequestCache: true,
  });
  const schema = applyMiddleware(
    makeExecutableSchema({
      resolvers: { Query: { test: () => 'Result' } },
      typeDefs: 'type Query { test: String! }',
    }),
    shield(
      { Query: { test: rule({ max: 5, window: '1s' }) } },
      { allowExternalErrors: true }
    )
  );
  const { data } = await graphql({
    schema,
    source: 'query { test otherTest: test otherOtherTest: test }',
    rootValue: {},
    contextValue: { id: '1' },
  });
  t.deepEqual(data, {
    test: 'Result',
    otherTest: 'Result',
    otherOtherTest: 'Result',
  });
});

test('rate limit with graphql shield', async (t) => {
  const rule = createRateLimitRule({
    identifyContext: (ctx) => ctx.id,
  });
  const schema = applyMiddleware(
    makeExecutableSchema({
      resolvers: { Query: { test: () => 'Result' } },
      typeDefs: 'type Query { test: String! }',
    }),
    shield({ Query: { test: rule({ max: 1, window: '1s' }) } })
  );

  const res = await graphql({
    schema,
    source: 'query { test }',
    rootValue: {},
    contextValue: { id: '1' },
  });
  t.deepEqual(res.data, { test: 'Result' });

  const res2 = await graphql({
    schema,
    source: 'query { test }',
    rootValue: {},
    contextValue: { id: '1' },
  });
  t.falsy(res2.data);
  t.truthy(res2.errors);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  t.is(res2.errors!.length, 1);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const [error] = res2.errors!;
  t.is(error.message, "You are trying to access 'test' too often");

  const res3 = await graphql({
    schema,
    source: 'query{test}',
    rootValue: {},
    contextValue: { id: '2' },
  });
  t.deepEqual(res3.data, { test: 'Result' });
});

test('rate limit with base rate limiter', async (t) => {
  const rateLimiter = getGraphQLRateLimiter({
    identifyContext: (ctx) => ctx.id,
  });
  const schema = makeExecutableSchema({
    resolvers: {
      Query: {
        test: async (parent, args, context, info) => {
          const errorMessage = await rateLimiter(
            { parent, args, context, info },
            { max: 1, window: '1s' }
          );
          if (errorMessage) throw new Error(errorMessage);
          return 'Result';
        },
      },
    },
    typeDefs: 'type Query { test: String! }',
  });

  const res = await graphql({
    schema,
    source: 'query { test }',
    rootValue: {},
    contextValue: { id: '1' },
  });
  t.deepEqual(res.data, { test: 'Result' });

  const res2 = await graphql({
    schema,
    source: 'query { test }',
    rootValue: {},
    contextValue: { id: '1' },
  });
  t.falsy(res2.data);
  t.truthy(res2.errors);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  t.is(res2.errors!.length, 1);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const [error] = res2.errors!;
  t.is(error.message, "You are trying to access 'test' too often");

  const res3 = await graphql({
    schema,
    source: 'query{test}',
    rootValue: {},
    contextValue: { id: '2' },
  });
  t.deepEqual(res3.data, { test: 'Result' });
});
