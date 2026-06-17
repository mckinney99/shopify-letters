# No inbound rule on the ECS task SG: cloudflared makes outbound-only
# connections to the Cloudflare edge. Traffic arrives from Cloudflare's
# network through the tunnel, not through any open inbound port.
resource "aws_security_group" "ecs_task" {
  name        = "${var.app_name}-ecs-sg"
  description = "Staging ECS task — outbound only (cloudflared tunnel, no ALB)"
  vpc_id      = data.aws_vpc.main.id

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.app_name}-ecs-sg"
  }
}

resource "aws_security_group" "rds" {
  name        = "${var.app_name}-rds-sg"
  description = "Allow Postgres from the staging ECS task only"
  vpc_id      = data.aws_vpc.main.id

  ingress {
    description     = "Postgres from ECS task"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_task.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.app_name}-rds-sg"
  }
}
