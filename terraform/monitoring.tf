resource "aws_sns_topic" "alerts" {
  name = "${var.app_name}-alerts"
}

resource "aws_sns_topic_subscription" "alert_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_cloudwatch_log_metric_filter" "price_mismatch_alert" {
  name           = "${var.app_name}-price-mismatch-alert"
  log_group_name = aws_cloudwatch_log_group.app.name

  # Matches JSON log lines where event = "price_mismatch_rate_exceeded"
  # (emitted by logAlert() in app/utils/metrics.ts when the per-shop
  # preview/charged mismatch rate exceeds 5% over 10+ samples).
  pattern = "{ $.event = \"price_mismatch_rate_exceeded\" }"

  metric_transformation {
    name      = "MismatchAlertCount"
    namespace = "Etch/Alerts"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "price_mismatch_alert" {
  alarm_name          = "${var.app_name}-price-mismatch-rate-exceeded"
  alarm_description   = "price_mismatch_rate_exceeded logged: preview/charged price mismatch rate for a shop exceeded 5% over 10+ samples."
  namespace           = "Etch/Alerts"
  metric_name         = "MismatchAlertCount"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
