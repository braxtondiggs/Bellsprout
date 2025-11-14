-- Create function to create monthly partitions for content_items table
CREATE OR REPLACE FUNCTION create_content_partition(year INT, month INT)
RETURNS TEXT AS $$
DECLARE
    partition_name TEXT;
    start_date DATE;
    end_date DATE;
BEGIN
    partition_name := 'content_items_' || year || '_' || LPAD(month::TEXT, 2, '0');
    start_date := make_date(year, month, 1);
    end_date := start_date + INTERVAL '1 month';

    -- Create partition if it doesn't exist
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF content_items
         FOR VALUES FROM (%L) TO (%L)',
        partition_name,
        start_date,
        end_date
    );

    RETURN partition_name;
END;
$$ LANGUAGE plpgsql;
