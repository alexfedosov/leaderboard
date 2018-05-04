import { Collection, Db } from 'mongodb';
import { ListOptions } from './Leaderboard';

export interface CreateOptions {
    ttl?: number;
}

export interface ListOptions {
    limit?: number;
}

export interface RecordOptions {
    id: any;
    score: number;
    expireAt?: number;
}

export class Leaderboard {
    private db: Db;

    constructor(db: Db) {
        this.db = db;
    }

    public async create(leaderboardId: string, opts?: CreateOptions): Promise<void> {
        const collection = this.getCollection(leaderboardId);

        const spec = (opts.ttl)
            ? { createdAt: 1 }
            : { expireAt: 1 };

        const options = (opts.ttl)
            ? { expireAfterSeconds: opts.ttl }
            : { expireAfterSeconds: 0 };

        await collection.createIndex(spec, options);
        await collection.createIndex({ score: -1 });
        await collection.createIndex({ id: 1 });
    }

    public async destroy(leaderboardId: string) {
        const collection = this.getCollection(leaderboardId);
        await collection.dropIndexes();
        return collection.drop();
    }

    public record(leaderboardId: string, row: any & RecordOptions, expireAt?: number): Promise<any> {
        const id = row.id;
        delete row.id;

        const score = row.score;
        delete row.score;

        const update: any = {
            $inc: { score },
            $setOnInsert: { createdAt: new Date() },
        };

        if (Object.keys(row).length > 0) {
            update.$set = row;
        }

        return new Promise((resolve, reject) => {
            this.getCollection(leaderboardId).
                findOneAndUpdate({ id }, update, { upsert: true }).
                then((r) => resolve(r.ok));
        });
    }

    public list(leaderboardId: string, opts: ListOptions = { limit: 10 }) {
        const collection = this.getCollection(leaderboardId);
        const cursor = collection.find({});
        cursor.project({ _id: 0 });
        cursor.sort({ score: -1 });
        cursor.limit(opts.limit);
        return cursor.toArray();
    }

    public async position(leaderboardId: string, id: any) {
        const collection = this.getCollection(leaderboardId);
        const user = await collection.findOne({ id });
        return await collection.find({ score: { $gt: user.score } }).count() + 1;
    }

    public async surrounding(leaderboardId: string, id: any, opts: ListOptions = { limit: 5 }) {
        const collection = this.getCollection(leaderboardId);
        const user = await collection.findOne({ id });

        const [ before, after ] = await Promise.all([
            collection.
                find({ id: { $ne: id }, score: { $lte: user.score } }).
                project({ _id: 0 }).
                sort({ score: -1 }).
                limit(opts.limit).
                toArray(),

            collection.
                find({ id: { $ne: id }, score: { $gte: user.score } }).
                project({ _id: 0 }).
                sort({ score: 1 }).
                limit(opts.limit).
                toArray(),
        ]);

        return after.reverse().concat(user).concat(before);
    }

    protected getCollection(leaderboardId: string) {
        return this.db.collection(`lb_${leaderboardId}`);
    }
}
