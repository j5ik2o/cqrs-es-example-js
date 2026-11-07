CREATE TABLE `read_model_dead_letters`
(
    `projection_name`    varchar(128) NOT NULL,
    `projection_version` varchar(32)  NOT NULL,
    `store_id`           varchar(128) NOT NULL,
    `aggregate_id`       varchar(64)  NOT NULL,
    `seq_nr`             int          NOT NULL,
    `failure_type`       varchar(32)  NOT NULL,
    `error_message`      TEXT         NOT NULL,
    `attempts`           int          NOT NULL,
    `occurred_at`        datetime(3)  NULL,
    `manifest`           varchar(255) NULL,
    `record_identifier`  varchar(255) NULL,
    `created_at`         datetime(3)  NOT NULL,
    `updated_at`         datetime(3)  NOT NULL,
    PRIMARY KEY (`projection_name`, `aggregate_id`, `seq_nr`),
    KEY `read_model_dead_letters_created_at` (`created_at`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4;
