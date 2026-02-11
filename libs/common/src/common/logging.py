"""Logging configuration with optional CloudWatch support."""

import logging
import os


def setup_cloudwatch_logging(service_name: str) -> None:
    """Configure logging with CloudWatch handler in production.

    Args:
        service_name: Name of the service (e.g., "room-service", "chat-service", "gateway")

    Environment variables:
        ENABLE_CLOUDWATCH: Set to "true" to enable CloudWatch logging
        CLOUDWATCH_LOG_GROUP: Log group name (default: "grand-secretariat")
        AWS_REGION: AWS region (default: "us-east-1")
    """
    log_group = os.environ.get("CLOUDWATCH_LOG_GROUP", "grand-secretariat")
    aws_region = os.environ.get("AWS_REGION", "us-east-1")

    # Configure root logger
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)

    # Clear any existing handlers
    logger.handlers.clear()

    # Console handler (always enabled)
    console = logging.StreamHandler()
    console.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    )
    logger.addHandler(console)

    # CloudWatch handler (if enabled)
    if os.environ.get("ENABLE_CLOUDWATCH", "").lower() == "true":
        try:
            import watchtower

            cw_handler = watchtower.CloudWatchLogHandler(
                log_group_name=log_group,
                log_stream_name=service_name,
                use_queues=True,
                create_log_group=True,
            )
            cw_handler.setFormatter(
                logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
            )
            logger.addHandler(cw_handler)
            logger.info(
                "CloudWatch logging enabled: group=%s, stream=%s",
                log_group,
                service_name,
            )
        except ImportError:
            logger.warning("watchtower not installed, CloudWatch logging disabled")
        except Exception as e:
            logger.warning("Failed to initialize CloudWatch logging: %s", e)
