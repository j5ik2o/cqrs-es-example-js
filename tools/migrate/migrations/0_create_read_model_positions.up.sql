CREATE TABLE `read_model_positions`
(
    `aggregate_id` varchar(64) NOT NULL,
    `last_processed_sequence_number` int NOT NULL,
    PRIMARY KEY (`aggregate_id`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4;
