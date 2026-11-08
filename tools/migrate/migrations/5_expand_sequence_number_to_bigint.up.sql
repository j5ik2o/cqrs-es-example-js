-- ESA core-contract T-9: widen the per-aggregate projection watermarks to
-- BIGINT so sequence numbers above 2147483647 can be stored. Existing rows are
-- preserved by MODIFY COLUMN; the previous INT range is a subset of BIGINT.
ALTER TABLE `read_model_positions`
    MODIFY COLUMN `last_processed_sequence_number` BIGINT NOT NULL;

ALTER TABLE `group_chats`
    MODIFY COLUMN `last_processed_sequence_number` BIGINT NOT NULL;

ALTER TABLE `members`
    MODIFY COLUMN `last_processed_sequence_number` BIGINT NOT NULL;

ALTER TABLE `messages`
    MODIFY COLUMN `last_processed_sequence_number` BIGINT NOT NULL;
