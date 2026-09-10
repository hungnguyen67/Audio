USE audio_story;

ALTER TABLE chapters
	ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS chapter_audios_v2 (
	id CHAR(32) NOT NULL PRIMARY KEY,
	chapter_id CHAR(32) NOT NULL,
	voice VARCHAR(80) NOT NULL,
	content_hash CHAR(64) NOT NULL,
	status ENUM('none', 'generating', 'ready', 'error') NOT NULL DEFAULT 'none',
	error_message VARCHAR(500) NULL,
	audio_id CHAR(32) NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT fk_chapter_audios_v2_chapter FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
	CONSTRAINT fk_chapter_audios_v2_audio FOREIGN KEY (audio_id) REFERENCES audios(id) ON DELETE SET NULL,
	UNIQUE KEY unique_chapter_voice_content_v2 (chapter_id, voice, content_hash)
);

INSERT IGNORE INTO chapter_audios_v2 (id, chapter_id, voice, content_hash, status, audio_id)
SELECT REPLACE(UUID(), '-', ''), ca.chapter_id, 'edge:vi-VN-HoaiMyNeural',
			 SHA2(c.content, 256), 'ready', ca.audio_id
FROM chapter_audios ca
JOIN chapters c ON c.id = ca.chapter_id;

DROP TABLE chapter_audios;
RENAME TABLE chapter_audios_v2 TO chapter_audios;

CREATE TABLE IF NOT EXISTS playback_settings (
	id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
	voice VARCHAR(80) NOT NULL DEFAULT 'edge:vi-VN-HoaiMyNeural',
	playback_rate DECIMAL(3,2) NOT NULL DEFAULT 1.00,
	volume DECIMAL(3,2) NOT NULL DEFAULT 1.00,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chapter_progress (
	chapter_id CHAR(32) NOT NULL PRIMARY KEY,
	chunk_index INT NOT NULL DEFAULT 0,
	position_seconds DECIMAL(10,3) NOT NULL DEFAULT 0,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT fk_chapter_progress_chapter FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS story_progress (
	story_id CHAR(32) NOT NULL PRIMARY KEY,
	chapter_id CHAR(32) NOT NULL,
	chapter_number INT NOT NULL,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT fk_story_progress_story FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
	CONSTRAINT fk_story_progress_chapter FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
);

INSERT IGNORE INTO playback_settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS audio_chunks (
	id CHAR(32) NOT NULL PRIMARY KEY,
	chapter_audio_id CHAR(32) NOT NULL,
	chunk_index INT NOT NULL,
	audio_data LONGBLOB NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT fk_audio_chunks_cache FOREIGN KEY (chapter_audio_id) REFERENCES chapter_audios(id) ON DELETE CASCADE,
	UNIQUE KEY unique_audio_chunk (chapter_audio_id, chunk_index)
);